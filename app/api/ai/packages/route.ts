import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/serverRateLimit";

/**
 * POST /api/ai/packages  (R22 §C)
 *
 * Body: { budget_total, guests_count, event_type, priorities[] }
 * Auth: Bearer <supabase access token>
 *
 * Returns 3 budget-split proposals via OpenAI. When OPENAI_API_KEY is
 * not configured we return 503 so the client transparently falls back
 * to the deterministic engine in lib/aiPackagesCalculator.ts.
 *
 * Rate limit: 5 calls / user / day. Unlike /api/cfo/extract there is no
 * domain table to count, so this uses an in-memory, date-bucketed
 * counter. It's per-instance (best-effort on serverless) — good enough
 * to stop a tight abuse loop without a schema change.
 */

interface PackagesBody {
  budget_total?: number;
  guests_count?: number;
  event_type?: string;
  priorities?: string[];
}

const DAILY_QUOTA = 5;

// R30 — was a bespoke Map that grew one entry per user forever (leak).
// The shared limiter self-prunes expired windows.
function bumpRate(userId: string): boolean {
  return rateLimit("ai-packages", userId, DAILY_QUOTA, 24 * 60 * 60 * 1000);
}

const SYSTEM_PROMPT = `אתה יועץ תקציב אירועים ישראלי. בהינתן תקציב כולל, מספר מוזמנים, סוג אירוע ושלוש עדיפויות — החזר בדיוק 3 חבילות פיצול שונות לאותו תקציב כולל.

החזר אך ורק JSON תקין במבנה הבא (ללא טקסט נוסף):
{
  "packages": [
    {
      "name": "שם קצר בעברית (למשל: המסעדה)",
      "emoji": "אימוג'י יחיד",
      "per_guest": <מספר שלם בש"ח = total חלקי מספר המוזמנים>,
      "total": <מספר שלם בש"ח, שווה לתקציב הכולל>,
      "pros": ["4-5 דברים שמקבלים, בעברית"],
      "cons": ["3-4 דברים שמתפשרים עליהם, בעברית"],
      "breakdown": { "food": <ש"ח>, "venue": <ש"ח>, "music": <ש"ח>, "photography": <ש"ח>, "decor": <ש"ח>, "alcohol": <ש"ח> },
      "vibe_score": <1 עד 10>
    }
  ],
  "recommendation": "משפט אחד בעברית שממליץ על החבילה המתאימה ביותר לעדיפויות"
}

חוקים: כל breakdown מסתכם בדיוק ל-total. total זהה בכל 3 החבילות ושווה לתקציב הכולל. כל חבילה מתעדפת 2 קטגוריות שונות ומתפשרת על השאר. עברית תקנית בלבד.`;

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // No key → tell the client to use its deterministic fallback.
      return NextResponse.json(
        { error: "AI not configured" },
        { status: 503 },
      );
    }
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 503 },
      );
    }

    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${auth.slice(7)}` } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!bumpRate(user.id)) {
      return NextResponse.json(
        {
          error: `הגעת למכסה היומית של ${DAILY_QUOTA} בקשות AI. תוכל להמשיך מחר.`,
          quotaExhausted: true,
        },
        { status: 429 },
      );
    }

    const body = (await req.json()) as PackagesBody;
    const total = Number(body.budget_total);
    const guests = Number(body.guests_count);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(guests) || guests <= 0) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // R36 B5 — validate priorities: must be an array, ≤5 entries, each a
    // short string. Stops a malformed/oversized array from being
    // interpolated straight into the LLM prompt (prompt-bloat / abuse).
    if (body.priorities !== undefined && !Array.isArray(body.priorities)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const priorities = (body.priorities ?? [])
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.slice(0, 40))
      .slice(0, 5);

    const userPrompt = `תקציב כולל: ₪${Math.round(total)}
מספר מוזמנים: ${Math.round(guests)}
סוג אירוע: ${String(body.event_type ?? "wedding").slice(0, 40)}
עדיפויות: ${priorities.join(", ")}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.8,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error("[/api/ai/packages] OpenAI", res.status);
      return NextResponse.json({ error: "AI failed" }, { status: 502 });
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (e) {
    // Never leak OpenAI / Supabase internals. The client falls back.
    console.error("[/api/ai/packages]", e);
    return NextResponse.json(
      { error: "לא הצלחנו ליצור הצעות כרגע." },
      { status: 500 },
    );
  }
}
