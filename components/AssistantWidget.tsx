"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppState, actions, getStateSnapshot } from "@/lib/store";
import { useUser } from "@/lib/user";
import { getSupabase } from "@/lib/supabase";
import { generateAssistantReply } from "@/lib/aiAssistant";
import {
  buildAssistantContext,
  buildSuggestedQuestions,
  type AssistantResponse,
  type ChatMessage,
} from "@/lib/assistant";
import { Sparkles, X, Send, Bot, Zap } from "lucide-react";

const QUICK_PROMPTS = [
  "כמה צריך במעטפה?",
  "איזה ספק כדאי לסגור עכשיו?",
  "כמה ימים נותרו?",
  "מה השלב הבא?",
];

/** Cap how many turns of history we send to the API. The full transcript
 *  stays in localStorage; we just shorten what hits the network. */
const HISTORY_TURNS_TO_SEND = 8;

export function AssistantWidget() {
  const pathname = usePathname();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  // Latest known remaining quota (-1 means "tracking off"; only meaningful
  // when the user is signed in via Supabase).
  const [remainingQuota, setRemainingQuota] = useState<number>(-1);
  // Server-suggested follow-up chips. Falls back to a local computation when
  // the API didn't include them (offline / fallback path).
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  // AbortController for the in-flight chat request. Cancelling on unmount /
  // close prevents setState-on-unmounted warnings and stops a slow LLM call
  // from spending tokens after the user lost interest.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  // R14 BUG#3: also abort when the panel closes mid-thinking. Without this,
  // the request would still resolve and `actions.pushAssistantMessage` would
  // append a reply the user never sees — burning a quota slot for nothing.
  //
  // R12 §3P: also pop the orphan user message. The widget pushes the user
  // turn optimistically before the network call; if we abort mid-flight,
  // that turn sits in the transcript with no reply, looking broken when
  // the user opens the widget again. `popLastAssistantMessage` is name-
  // misleading but actually pops the last message regardless of sender,
  // which is exactly what we want.
  useEffect(() => {
    if (!open) {
      const wasThinking = thinking;
      abortRef.current?.abort();
      if (wasThinking) {
        actions.popLastAssistantMessage();
      }
    }
  }, [open, thinking]);

  // Hide on signup, RSVP and root marketing pages.
  const hidden =
    pathname === "/" ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/rsvp") ||
    !userHydrated || !user || !hydrated || !state.event;

  // Auto-scroll to bottom whenever a new message arrives or the typing
  // indicator toggles. The early-return on `!open` keeps us from forcing a
  // scroll on a hidden, height-zero panel (which would be a no-op anyway,
  // but we'd burn a render).
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [open, state.assistantMessages.length, thinking]);

  // Suggested chips computed from the live state — rendered above the
  // empty-state quick-prompts and after each assistant reply. We prefer the
  // server's list when it included one (post-reply); otherwise compute
  // locally from the snapshot so the empty state still has chips.
  const suggestions = useMemo(() => {
    if (serverSuggestions.length > 0) return serverSuggestions;
    return buildSuggestedQuestions(buildAssistantContext(state));
  }, [serverSuggestions, state]);

  if (hidden) return null;

  const sendMessage = async (text: string) => {
    if (!text.trim() || thinking) return;

    // Push the user's turn into the local transcript immediately — gives the
    // user instant feedback even before the network call resolves.
    actions.pushAssistantMessage(text, true);
    setInput("");
    setThinking(true);
    setServerSuggestions([]);

    // Cancel any prior in-flight request — quick double-clicks shouldn't
    // queue two model calls.
    //
    // R17 P1#6 — race notes: we capture `controller` in this function's
    // closure and reference it in the try/catch/finally below (NOT via
    // `abortRef.current`). That way, if a fresh send replaces abortRef
    // mid-flight, this older invocation still sees its OWN aborted flag
    // and bails cleanly instead of reacting to the new controller.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Read the freshest state right before building the context so concurrent
    // updates (a guest just confirmed, a vendor just got saved) are reflected.
    const snapshot = getStateSnapshot();
    const context = buildAssistantContext(snapshot);

    // Build the message history we send to the server. We map the local
    // {fromUser:boolean} shape onto the OpenAI-style {role} shape, then
    // tack on the new user turn.
    const history: ChatMessage[] = snapshot.assistantMessages
      .slice(-HISTORY_TURNS_TO_SEND)
      .map<ChatMessage>((m) => ({
        role: m.fromUser ? "user" : "assistant",
        content: m.text,
      }));
    // The local transcript already has the user's new turn (we pushed
    // above), so the slice already ends with it. No need to append again.

    try {
      // Attach the Supabase JWT when available so the route can enforce
      // per-user quota and log to assistant_messages. Anonymous local-mode
      // requests skip the header — the route handles that gracefully.
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const supabase = getSupabase();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
      }

      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: history, context }),
        signal: controller.signal,
      });

      const data = (await res.json()) as Partial<AssistantResponse> & {
        fallbackAvailable?: boolean;
        quotaExhausted?: boolean;
      };

      if (controller.signal.aborted) return;

      if (res.ok && data.reply) {
        actions.pushAssistantMessage(data.reply, false);
        if (typeof data.remainingQuota === "number") {
          setRemainingQuota(data.remainingQuota);
        }
        if (data.suggestedQuestions) {
          setServerSuggestions(data.suggestedQuestions);
        }
      } else if (res.status === 429 || data.quotaExhausted) {
        // R19 P1#4 — quota exhausted. Pop the user's optimistic turn first
        // so the transcript doesn't carry an unanswered question; then push
        // a single system notice in its place. This way the conversation
        // reads honestly: "you tried, here's why it didn't go through"
        // instead of "your question is hanging there with a system reply
        // tacked on as if I answered".
        actions.popLastAssistantMessage();
        actions.pushAssistantMessage(
          data.error ?? "⏰ הגעת למכסה היומית. מתאפסת בחצות.",
          false,
        );
        setRemainingQuota(0);
      } else if (data.fallbackAvailable) {
        // Soft failure (no key, OpenAI down). Use the rule-based responder
        // so the user still gets *something* useful.
        const localReply = generateAssistantReply(text, snapshot);
        actions.pushAssistantMessage(localReply, false);
      } else {
        actions.pushAssistantMessage(
          data.error ?? "משהו השתבש. נסה שוב.",
          false,
        );
      }
    } catch (e) {
      // Aborts arrive here too — silently swallow them (we already cleaned up).
      if (controller.signal.aborted) return;
      console.error("[AssistantWidget] chat call failed", e);
      // Network failure — try the local responder before giving up.
      const localReply = generateAssistantReply(text, getStateSnapshot());
      actions.pushAssistantMessage(localReply, false);
    } finally {
      if (!controller.signal.aborted) setThinking(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const messages = state.assistantMessages;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="פתח עוזר אישי"
          className="assistant-launcher fixed bottom-[88px] md:bottom-5 end-5 z-40 w-14 h-14 rounded-full pulse-gold flex items-center justify-center shadow-[0_18px_40px_-12px_var(--accent-glow)] transition hover:scale-105"
          style={{ background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))", color: "var(--gold-button-text)" }}
        >
          <Sparkles size={22} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[88px] md:bottom-5 end-5 z-40 w-[calc(100%-2.5rem)] max-w-[400px] flex flex-col rounded-3xl glass-strong overflow-hidden shadow-[0_30px_70px_-20px_rgba(0,0,0,0.6)] border" style={{ borderColor: "var(--border-strong)", maxHeight: "min(640px, calc(100vh - 8rem))" }}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))", color: "var(--gold-button-text)" }}>
                <Bot size={18} />
              </div>
              <div>
                <div className="font-bold text-sm">עוזר Momentum</div>
                <div className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--foreground-muted)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  פעיל ומוכן
                  {/* Show the remaining-quota badge only when the server told
                      us a real number (>=0). -1 means tracking is off (no
                      Supabase auth) — we hide the badge then to avoid
                      misleading "∞ remaining" implications. */}
                  {remainingQuota >= 0 && (
                    <span
                      className="ms-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: "var(--input-bg)",
                        border: "1px solid var(--border)",
                      }}
                      title="שאלות שנותרו היום"
                    >
                      <Zap size={9} className="text-[--accent]" />
                      <span className="ltr-num">{remainingQuota}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="סגור" className="p-2 rounded-full hover:bg-[var(--secondary-button-bg)]">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: "320px" }}>
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="text-sm leading-relaxed" style={{ color: "var(--foreground-soft)" }}>
                  היי 👋 אני כאן לעזור עם כל שאלה על האירוע שלך.
                  אני מכיר את הפרטים שלך — תקציב, ספקים, מוזמנים — ויכול לתת המלצות חכמות.
                </div>
                <div className="text-xs font-semibold mt-4" style={{ color: "var(--foreground-muted)" }}>נסה לשאול:</div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => void sendMessage(q)}
                      className="text-xs rounded-full px-3 py-1.5 transition hover:bg-[var(--secondary-button-bg)]"
                      style={{ border: "1px solid var(--border)", color: "var(--foreground-soft)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <Message key={m.id} fromUser={m.fromUser} text={m.text} />
            ))}

            {/* Suggested follow-up chips (post-reply). Only show when there's
                a transcript AND we're not currently thinking — keeps the
                empty state from showing two chip rows simultaneously. */}
            {messages.length > 0 && !thinking && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => void sendMessage(q)}
                    className="text-[11px] rounded-full px-2.5 py-1 transition hover:bg-[var(--secondary-button-bg)]"
                    style={{ border: "1px solid var(--border)", color: "var(--foreground-muted)" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {thinking && (
              <div className="flex items-center gap-2 px-3 py-2" style={{ color: "var(--foreground-muted)" }}>
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full sparkle" style={{ background: "var(--accent)" }} />
                  <span className="w-2 h-2 rounded-full sparkle-2" style={{ background: "var(--accent)" }} />
                  <span className="w-2 h-2 rounded-full sparkle-3" style={{ background: "var(--accent)" }} />
                </div>
                <span className="text-xs">חושב...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="p-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל אותי כל דבר..."
              className="input flex-1 !py-2.5 text-sm"
              disabled={thinking || remainingQuota === 0}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking || remainingQuota === 0}
              aria-label="שלח"
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 transition hover:scale-105"
              style={{ background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))", color: "var(--gold-button-text)" }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Message({ fromUser, text }: { fromUser: boolean; text: string }) {
  return (
    <div className={`flex ${fromUser ? "justify-end" : "justify-start"} fade-up`}>
      <div
        className="rounded-2xl px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-line leading-relaxed"
        style={
          fromUser
            ? { background: "linear-gradient(135deg, var(--gold-100), var(--gold-500))", color: "var(--gold-button-text)" }
            : { background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--foreground)" }
        }
      >
        {text}
      </div>
    </div>
  );
}
