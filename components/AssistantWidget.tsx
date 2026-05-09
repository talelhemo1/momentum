"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppState, actions, getStateSnapshot } from "@/lib/store";
import { useUser } from "@/lib/user";
import { generateAssistantReply } from "@/lib/aiAssistant";
import { Sparkles, X, Send, Bot } from "lucide-react";

const QUICK_PROMPTS = [
  "כמה צריך במעטפה?",
  "איזה ספק כדאי לסגור עכשיו?",
  "כמה ימים נותרו?",
  "מה השלב הבא?",
];

export function AssistantWidget() {
  const pathname = usePathname();
  const { state, hydrated } = useAppState();
  const { user, hydrated: userHydrated } = useUser();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hide on signup, RSVP and root marketing pages.
  const hidden =
    pathname === "/" ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/rsvp") ||
    !userHydrated || !user || !hydrated || !state.event;

  useEffect(() => {
    // Auto-scroll on new messages
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, state.assistantMessages.length, thinking]);

  if (hidden) return null;

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    actions.pushAssistantMessage(text, true);
    setInput("");
    setThinking(true);
    // Simulate small delay so it feels like the assistant is "thinking".
    // Read the freshest state at reply-generation time via getStateSnapshot()
    // — using the closed-over `state` would be one render stale and could miss
    // the message we just pushed (and any other concurrent updates).
    setTimeout(() => {
      const reply = generateAssistantReply(text, getStateSnapshot());
      actions.pushAssistantMessage(reply, false);
      setThinking(false);
    }, 700);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
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
                <div className="text-[11px] flex items-center gap-1" style={{ color: "var(--foreground-muted)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> פעיל ומוכן
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
                      onClick={() => sendMessage(q)}
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
              disabled={thinking}
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
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
