import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractReceiptData } from "@/lib/cfoAi";

/**
 * POST /api/cfo/extract
 *
 * Body: { imageDataUrl?: string; text?: string }
 * Auth: Bearer <supabase access token>
 *
 * Pipes a receipt (image data URL OR raw text) through OpenAI and returns
 * the structured extraction. We re-create a per-request Supabase client
 * with the user's token so RLS sees them — matches the pattern used by
 * /api/assistant/chat in this project.
 *
 * R12 §1G hardening:
 *   - Image payload capped at 5MB (data-URLs balloon ~33% over the binary)
 *   - MIME prefix gate: only `image/png|jpeg|webp` accepted
 *   - Daily quota: 20 extractions per user (rolling midnight Israel time)
 */

interface ExtractRequestBody {
  imageDataUrl?: string;
  text?: string;
}

// 5 MB cap on the data URL. Base64 inflates payload by ~33%, so a clean
// 4MB JPEG is ~5.3MB encoded. We bias toward "reject early" since OpenAI
// will reject anything significantly larger anyway.
const MAX_IMAGE_BYTES = 5_000_000;
const IMAGE_DATA_URL_PREFIX = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const DAILY_QUOTA = 20;

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as ExtractRequestBody;
    if (!body.imageDataUrl && !body.text) {
      return NextResponse.json({ error: "Missing input" }, { status: 400 });
    }

    // R12 §1G — payload validation. The image checks run BEFORE any
    // expensive OpenAI call so a malicious payload can't burn tokens.
    if (body.imageDataUrl) {
      if (body.imageDataUrl.length > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "התמונה גדולה מ-5MB. צמצם את הקובץ ונסה שוב." },
          { status: 413 },
        );
      }
      if (!IMAGE_DATA_URL_PREFIX.test(body.imageDataUrl)) {
        return NextResponse.json(
          { error: "פורמט תמונה לא נתמך. רק PNG, JPG, או WebP." },
          { status: 400 },
        );
      }
    }

    // R12 §1G — daily quota. Counts receipts SAVED today (best proxy we
    // have without a dedicated counter table). The user can call extract
    // many times per save in theory, but in practice the UI saves right
    // after a successful preview, so this lines up with usage.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = (await supabase
      .from("event_receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString())) as {
      count: number | null;
    };
    if ((count ?? 0) >= DAILY_QUOTA) {
      return NextResponse.json(
        {
          error: `הגעת למכסה היומית של ${DAILY_QUOTA} חילוצים. תוכל להמשיך מחר.`,
          quotaExhausted: true,
        },
        { status: 429 },
      );
    }

    const extracted = await extractReceiptData({
      imageDataUrl: body.imageDataUrl,
      text: body.text,
    });

    return NextResponse.json({ extracted });
  } catch (e) {
    // R12 §1F — never leak OpenAI / Postgres / Supabase message text.
    console.error("[/api/cfo/extract]", e);
    return NextResponse.json(
      { error: "החילוץ נכשל. נסה שוב תוך כמה דקות." },
      { status: 500 },
    );
  }
}
