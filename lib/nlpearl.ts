import "server-only";

/**
 * NLPearl outbound API — server-only.
 * https://developers.nlpearl.ai/api-reference/v1/outbound/make-call
 */

const API_BASE = "https://api.nlpearl.ai/v1";

export interface NlpearlConfig {
  configured: boolean;
  apiKey: string | null;
  outboundId: string | null;
}

export function getNlpearlConfig(): NlpearlConfig {
  const apiKey = (process.env.NLPEARL_API_KEY ?? "").trim() || null;
  const outboundId =
    (process.env.NLPEARL_OUTBOUND_ID ?? process.env.NLPEARL_OUTBOUND_CAMPAIGN_ID ?? "")
      .trim() || null;
  return {
    configured: !!(apiKey && outboundId),
    apiKey,
    outboundId,
  };
}

export interface MakeCallInput {
  to: string;
  callData: Record<string, string | number | boolean>;
  externalId: string;
}

export interface MakeCallResult {
  ok: boolean;
  callId?: string;
  error?: string;
  queuePosition?: number;
}

export async function nlpearlMakeCall(input: MakeCallInput): Promise<MakeCallResult> {
  const { configured, apiKey, outboundId } = getNlpearlConfig();
  if (!configured || !apiKey || !outboundId) {
    return { ok: false, error: "nlpearl_not_configured" };
  }

  try {
    const res = await fetch(`${API_BASE}/Outbound/${outboundId}/Call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: input.to,
        callData: {
          ...input.callData,
          externalId: input.externalId,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[nlpearl] makeCall ${res.status}:`, body.slice(0, 300));
      return { ok: false, error: `nlpearl_${res.status}` };
    }

    const data = (await res.json()) as {
      id?: string;
      queuePosition?: number;
    };
    return {
      ok: true,
      callId: data.id,
      queuePosition: data.queuePosition,
    };
  } catch (e) {
    console.error("[nlpearl] makeCall threw:", e);
    return { ok: false, error: "nlpearl_network" };
  }
}
