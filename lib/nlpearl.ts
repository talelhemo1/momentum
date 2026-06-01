import "server-only";

/**
 * NLPearl outbound API — server-only.
 * https://developers.nlpearl.ai/api-reference/v1/outbound/make-call
 */

const API_BASE = "https://api.nlpearl.ai/v1";

export interface NlpearlConfig {
  configured: boolean;
  /** Raw secret from env (or full `accountId:secret` if stored in NLPEARL_API_KEY). */
  apiKey: string | null;
  outboundId: string | null;
  accountId: string | null;
  /** True when Authorization will use AccountId:SecretKey (required by NLPearl). */
  authTokenReady: boolean;
}

function trimEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Strip accidental `Bearer ` prefix from pasted env values. */
function normalizeNlpearlSecret(raw: string): string {
  const t = raw.trim();
  if (t.toLowerCase().startsWith("bearer ")) {
    return t.slice(7).trim();
  }
  return t;
}

/**
 * NLPearl expects `Authorization: Bearer AccountId:SecretKey`
 * @see https://developers.nlpearl.ai/api-reference/authorization
 */
export function getNlpearlBearerToken(): string | null {
  const secret = normalizeNlpearlSecret(trimEnv("NLPEARL_API_KEY"));
  if (!secret) return null;

  if (secret.includes(":")) {
    return secret;
  }

  const accountId = trimEnv("NLPEARL_ACCOUNT_ID");
  if (accountId) {
    return `${accountId}:${secret}`;
  }

  return secret;
}

export function getNlpearlAuthorizationHeader(): string | null {
  const token = getNlpearlBearerToken();
  return token ? `Bearer ${token}` : null;
}

export type NlpearlAuthMode = "split_env" | "combined_in_api_key" | "secret_only";

/** Safe auth metadata for diagnose (no secrets). */
export interface NlpearlAuthDiagnostics {
  mode: NlpearlAuthMode;
  apiKeyHasColon: boolean;
  /** NLPEARL_API_KEY starts with literal "AccountId" from docs — always 401. */
  placeholderLiteralAccountId: boolean;
  /** When both env vars set and API_KEY contains `:`, prefixes must match. */
  combinedAccountIdMatchesEnv: boolean | null;
  bearerAccountIdPrefixLength: number | null;
}

export function getNlpearlAuthDiagnostics(): NlpearlAuthDiagnostics | null {
  const apiKey = normalizeNlpearlSecret(trimEnv("NLPEARL_API_KEY"));
  if (!apiKey) return null;

  const accountId = trimEnv("NLPEARL_ACCOUNT_ID") || null;
  const apiKeyHasColon = apiKey.includes(":");
  const keyAccountPrefix = apiKeyHasColon ? apiKey.split(":")[0] : null;

  let mode: NlpearlAuthMode = "secret_only";
  if (apiKeyHasColon) mode = "combined_in_api_key";
  else if (accountId) mode = "split_env";

  return {
    mode,
    apiKeyHasColon,
    placeholderLiteralAccountId:
      !!keyAccountPrefix && /^accountid$/i.test(keyAccountPrefix.trim()),
    combinedAccountIdMatchesEnv:
      apiKeyHasColon && accountId && keyAccountPrefix
        ? keyAccountPrefix === accountId
        : null,
    bearerAccountIdPrefixLength: keyAccountPrefix?.length ?? accountId?.length ?? null,
  };
}

export function getNlpearlConfig(): NlpearlConfig {
  const apiKey = normalizeNlpearlSecret(trimEnv("NLPEARL_API_KEY")) || null;
  const accountId = trimEnv("NLPEARL_ACCOUNT_ID") || null;
  const outboundId =
    (trimEnv("NLPEARL_OUTBOUND_ID") || trimEnv("NLPEARL_OUTBOUND_CAMPAIGN_ID")) || null;
  const authTokenReady = !!(apiKey && (accountId || apiKey.includes(":")));
  return {
    configured: !!(authTokenReady && outboundId),
    apiKey,
    outboundId,
    accountId,
    authTokenReady,
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
  const { configured, outboundId } = getNlpearlConfig();
  const authorization = getNlpearlAuthorizationHeader();
  if (!configured || !authorization || !outboundId) {
    return { ok: false, error: "nlpearl_not_configured" };
  }

  try {
    const res = await fetch(`${API_BASE}/Outbound/${outboundId}/Call`, {
      method: "POST",
      headers: {
        Authorization: authorization,
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
