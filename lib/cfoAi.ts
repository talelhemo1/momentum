/**
 * Wedding CFO — receipt-extraction AI (R20 Phase 7).
 *
 * Server-only. Calls OpenAI's chat completions endpoint directly with
 * fetch (the existing /api/assistant/chat route does the same) — keeps
 * the bundle slim and avoids pulling in the openai SDK.
 */

export interface ExtractedReceipt {
  vendor_name?: string;
  category?: string;
  /** Total in NIS (shekels). The caller multiplies by 100 to store agorot. */
  total_amount?: number;
  /** ISO date YYYY-MM-DD if mentioned in the receipt. */
  due_date?: string;
  installments?: Array<{ amount: number; due_date: string; label?: string }>;
  notes?: string;
  /** 0-100 model self-confidence. UI surfaces it next to the preview. */
  confidence: number;
}

const SYSTEM_PROMPT = `You are a receipt analyzer for Israeli wedding vendors. Extract structured data from receipt images or text in Hebrew.

Return JSON only with these fields:
- vendor_name: business name (Hebrew if applicable)
- category: one of [venue, catering, photography, videography, music-dj, rabbi, makeup-hair, bridal, groomswear, florist, invitations, chuppah, transport, printing, other]
- total_amount: total in NIS (shekels, not agorot)
- due_date: ISO date YYYY-MM-DD if mentioned
- installments: array of payment installments if multiple payments mentioned
- notes: any important detail
- confidence: 0-100 your confidence in extraction

If unclear, return null for the field. Always return valid JSON.`;

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ChatPart[] };

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Extracts receipt data from a base64 data URL or a plain-text receipt.
 * Throws with a clear message when the API key is missing or the model
 * returns malformed JSON — caller is expected to translate to the user.
 */
export async function extractReceiptData(input: {
  imageDataUrl?: string;
  text?: string;
}): Promise<ExtractedReceipt> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (input.imageDataUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: "חלץ את נתוני החשבונית הזו:" },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ],
    });
  } else if (input.text) {
    messages.push({
      role: "user",
      content: `חלץ את נתוני החשבונית מהטקסט הבא:\n\n${input.text}`,
    });
  } else {
    throw new Error("No input provided");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errorBody}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI");

  return JSON.parse(raw) as ExtractedReceipt;
}
