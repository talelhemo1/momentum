import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildSystemPrompt,
  buildSuggestedQuestions,
  FREE_DAILY_QUOTA,
  PREMIUM_DAILY_QUOTA,
  type AssistantContext,
  type ChatMessage,
} from "@/lib/assistant";

// ─── Configuration ────────────────────────────────────────────────────────
// Costs (USD per 1M tokens, gpt-4o-mini, Nov 2024):
//   input  $0.15 / 1M  →  0.000015 / token
//   output $0.60 / 1M  →  0.000060 / token
// We store costs as integer cents to avoid float drift on aggregations.
const MODEL = "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 500;
// Cap conversation history we send to OpenAI so a long-running tab doesn't
// inflate context indefinitely. The full history stays in localStorage; we
// send only the last N turns + the new user message.
const MAX_HISTORY_TURNS = 8;
// Hard limit on a single user message — anything longer is almost certainly
// abuse or paste-error. Errors out before we even hit the model.
const MAX_USER_MESSAGE_CHARS = 2000;
// External-call timeout. OpenAI 99p is ~5s; we give 25s to absorb cold-starts
// without hanging the user's UI forever.
const OPENAI_TIMEOUT_MS = 25_000;

interface RequestBody {
  messages: ChatMessage[];
  context: AssistantContext;
}

interface OpenAIResponse {
  choices: { message: { role: string; content: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/** Convert OpenAI token counts to integer cents using the rates above. */
function computeCostCents(tokensIn: number, tokensOut: number): number {
  const usd = tokensIn * 0.000015 + tokensOut * 0.000060;
  return Math.round(usd * 100);
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Widget catches this and falls back to the local rule-based responder.
      // 503 is the right shape — service unavailable, not the user's fault.
      return NextResponse.json(
        {
          error: "השירות לא מוגדר. הוסף OPENAI_API_KEY ב-.env.local.",
          fallbackAvailable: true,
        },
        { status: 503 },
      );
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "אין הודעות בבקשה" }, { status: 400 });
    }

    // Find the latest user message — that's the one being asked. We don't
    // require alternation; the widget always appends the user's message to
    // the array before posting.
    const lastUserMsg = [...body.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMsg || !lastUserMsg.content.trim()) {
      return NextResponse.json({ error: "אין הודעת משתמש" }, { status: 400 });
    }
    if (lastUserMsg.content.length > MAX_USER_MESSAGE_CHARS) {
      return NextResponse.json({ error: "הודעה ארוכה מדי" }, { status: 400 });
    }

    // ── Auth + quota ──────────────────────────────────────────────────
    // R14.2 — was "best-effort" with a silent fall-through that let
    // anonymous callers consume OpenAI tokens without ever hitting the
    // daily quota. Now we REQUIRE a Bearer token whenever Supabase is
    // configured. Without that, anyone who knows the endpoint could
    // burn the OpenAI budget indefinitely.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let userId: string | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;
    let isPremium = false;
    let used = 0;
    let dailyQuota = FREE_DAILY_QUOTA;

    if (supabaseUrl && anonKey) {
      const auth = req.headers.get("authorization");
      if (!auth?.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "התחבר כדי להשתמש בעוזר." },
          { status: 401 },
        );
      }
      {
        supabase = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${auth.slice(7)}` } },
        });
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          // R14.2 — an invalid / expired Bearer token must NOT silently
          // fall through to the OpenAI call. Reject explicitly.
          return NextResponse.json(
            { error: "ההתחברות פגה. התחבר שוב." },
            { status: 401 },
          );
        }
        {
          userId = userData.user.id;
          // `profiles` is optional. maybeSingle() returns null when the row
          // doesn't exist (vs single() which would 406). Free tier is the
          // default whenever we can't prove premium.
          //
          // Type-assert the result: supabase-js v2 infers `never` for
          // tables that aren't in a generated `Database` type, so accessing
          // `.subscription_tier` on the inferred shape errors at compile time.
          const { data: profile } = (await supabase
            .from("profiles")
            .select("subscription_tier")
            .eq("id", userId)
            .maybeSingle()) as { data: { subscription_tier?: string } | null };
          isPremium = profile?.subscription_tier === "premium";
          dailyQuota = isPremium ? PREMIUM_DAILY_QUOTA : FREE_DAILY_QUOTA;

          // Count today's user-role messages (ignore assistant rows so the
          // user gets credit for ASKING, not for what we produce).
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const { count } = await supabase
            .from("assistant_messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("role", "user")
            .gte("created_at", todayStart.toISOString());
          used = count ?? 0;

          if (used >= dailyQuota) {
            return NextResponse.json(
              {
                error: isPremium
                  ? `הגעת למכסה היומית (${dailyQuota} שאלות). תוכל להמשיך מחר.`
                  : `הגעת למכסה היומית של ${dailyQuota} שאלות. שדרג לפרימיום ל-${PREMIUM_DAILY_QUOTA} ביום.`,
                remainingQuota: 0,
                quotaExhausted: true,
              },
              { status: 429 },
            );
          }
        }
      }
    }

    // ── Build the prompt + truncated history ──────────────────────────
    const systemPrompt = buildSystemPrompt(body.context);
    const trimmedHistory = body.messages.slice(-MAX_HISTORY_TURNS);
    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    ];

    // ── Call OpenAI ───────────────────────────────────────────────────
    let llmJson: OpenAIResponse;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: openaiMessages,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[/api/assistant/chat] OpenAI error", res.status, errText);
        return NextResponse.json(
          {
            error: "השירות זמני לא זמין. נסה שוב בעוד רגע.",
            fallbackAvailable: true,
          },
          { status: 502 },
        );
      }
      llmJson = (await res.json()) as OpenAIResponse;
    } catch (e) {
      console.error("[/api/assistant/chat] OpenAI fetch failed", e);
      return NextResponse.json(
        {
          error: "השירות זמני לא זמין. נסה שוב בעוד רגע.",
          fallbackAvailable: true,
        },
        { status: 502 },
      );
    }

    const reply = llmJson.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      return NextResponse.json(
        {
          error: "לא הצלחתי לייצר תשובה. נסה לנסח אחרת.",
          fallbackAvailable: true,
        },
        { status: 502 },
      );
    }

    const tokensIn = llmJson.usage?.prompt_tokens ?? 0;
    const tokensOut = llmJson.usage?.completion_tokens ?? 0;
    const costCents = computeCostCents(tokensIn, tokensOut);

    // ── Log to DB (best-effort, non-blocking failure) ─────────────────
    // We log BOTH the user turn and the assistant turn so the daily count
    // stays accurate (only user rows count toward quota above) and so the
    // history view in /settings can replay both sides of the conversation.
    if (supabase && userId) {
      const eventId =
        typeof body.context.event?.id === "string" ? body.context.event.id : null;
      const rows = [
        {
          user_id: userId,
          event_id: eventId,
          role: "user" as const,
          content: lastUserMsg.content.slice(0, MAX_USER_MESSAGE_CHARS),
          tokens_input: tokensIn,
          tokens_output: 0,
          cost_cents: 0,
        },
        {
          user_id: userId,
          event_id: eventId,
          role: "assistant" as const,
          content: reply,
          tokens_input: 0,
          tokens_output: tokensOut,
          cost_cents: costCents,
        },
      ];
      try {
        // Cast to `never` because supabase-js v2 expects insert() to match a
        // generated `Database` row type that we don't ship. The runtime shape
        // is correct — the table accepts these columns per the migration.
        await supabase
          .from("assistant_messages")
          .insert(rows as unknown as never);
      } catch (logErr) {
        // Don't fail the user-facing request just because logging hiccupped.
        console.error("[/api/assistant/chat] log insert failed", logErr);
      }
    }

    const remainingQuota = userId ? Math.max(0, dailyQuota - used - 1) : -1;

    return NextResponse.json({
      reply,
      remainingQuota,
      suggestedQuestions: buildSuggestedQuestions(body.context),
    });
  } catch (e) {
    // R19 security: full error stays in server logs; client gets a generic
    // Hebrew message + the `fallbackAvailable` flag so the widget can switch
    // to the rule-based responder. We deliberately don't echo `e.message`
    // because Supabase/fetch/OpenAI errors can include private URLs, schema
    // details, or partial API responses that shouldn't leave the server.
    console.error("[/api/assistant/chat]", e);
    return NextResponse.json(
      {
        error: "שגיאה פנימית. נסה שוב בעוד רגע.",
        fallbackAvailable: true,
      },
      { status: 500 },
    );
  }
}
