import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getNlpearlAuthDiagnostics,
  getNlpearlAuthorizationHeader,
  getNlpearlConfig,
} from "@/lib/nlpearl";

export const dynamic = "force-dynamic";

/**
 * NLPearl integration diagnostic (production troubleshooting).
 * GET /api/guests/voice-campaign/diagnose
 * Optional: Authorization Bearer (same as starting a campaign).
 */
export async function GET(req: NextRequest) {
  const cfg = getNlpearlConfig();
  const authDiag = getNlpearlAuthDiagnostics();
  const webhookSecret = (process.env.NLPEARL_WEBHOOK_SECRET ?? "").trim();

  const base = {
    nlpearl: {
      hasApiKey: !!cfg.apiKey,
      hasAccountId: !!cfg.accountId,
      authUsesAccountColonSecret: cfg.authTokenReady,
      authMode: authDiag?.mode ?? null,
      authPlaceholderAccountId: authDiag?.placeholderLiteralAccountId ?? false,
      authCombinedAccountIdMatchesEnv: authDiag?.combinedAccountIdMatchesEnv ?? null,
      hasOutboundId: !!cfg.outboundId,
      outboundIdLength: cfg.outboundId?.length ?? 0,
      hasWebhookSecret: !!webhookSecret,
      configured: cfg.configured,
    },
    webhook: {
      path: "/api/webhooks/nlpearl",
      getHealth: "ok",
    },
    issues: [] as string[],
  };

  if (!cfg.apiKey) {
    base.issues.push(
      "NLPEARL_API_KEY missing in Vercel Production — modal shows “NLPearl not connected”.",
    );
  } else if (!cfg.authTokenReady) {
    base.issues.push(
      "NLPearl auth incomplete — API requires AccountId:SecretKey. Set NLPEARL_ACCOUNT_ID (workspace Account ID) plus NLPEARL_API_KEY (secret from Copy key), OR set NLPEARL_API_KEY to AccountId:SecretKey. Copy key alone causes 401.",
    );
  } else if (authDiag?.placeholderLiteralAccountId) {
    base.issues.push(
      'NLPEARL_API_KEY still contains the docs placeholder "AccountId:" — remove it. Use NLPEARL_ACCOUNT_ID=your real ID and NLPEARL_API_KEY=secret only (from Copy key).',
    );
  } else if (authDiag?.combinedAccountIdMatchesEnv === false) {
    base.issues.push(
      "NLPEARL_API_KEY contains accountId:secret but the part before ':' does not match NLPEARL_ACCOUNT_ID — use one source of truth (split env recommended).",
    );
  }
  if (!cfg.outboundId) {
    base.issues.push(
      "NLPEARL_OUTBOUND_ID missing — calls cannot be queued.",
    );
  }
  if (!webhookSecret) {
    base.issues.push(
      "NLPEARL_WEBHOOK_SECRET missing — webhook accepts all POSTs (insecure); Pearl may still work.",
    );
  }

  if (!cfg.configured) {
    return NextResponse.json({
      ok: false,
      ...base,
      nlpearlApiProbe: null,
      auth: null,
    });
  }

  const auth = req.headers.get("authorization");
  let authOk: boolean | null = null;
  if (auth?.startsWith("Bearer ")) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && anonKey) {
      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user }, error } = await supabase.auth.getUser();
      authOk = !!user && !error;
      if (!authOk) {
        base.issues.push("Supabase session invalid — log in again on moomentum.events.");
      }
    }
  }

  let nlpearlApiProbe: {
    httpStatus: number;
    ok: boolean;
    hint: string;
    bodyPreview: string;
  } | null = null;

  const authorization = getNlpearlAuthorizationHeader();
  if (authorization && cfg.outboundId) {
    try {
      const res = await fetch(
        `https://api.nlpearl.ai/v1/Outbound/${cfg.outboundId}/Call`,
        {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: "",
            callData: { externalId: "diag:probe-no-dial" },
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      const text = (await res.text().catch(() => "")).slice(0, 400);
      nlpearlApiProbe = {
        httpStatus: res.status,
        ok: res.ok,
        bodyPreview: text,
        hint: probeHint(res.status, text),
      };
      if (res.status === 401 || res.status === 403) {
        base.issues.push(
          authDiag?.mode === "combined_in_api_key"
            ? "NLPearl API rejected auth (401/403) — NLPEARL_API_KEY has a colon so NLPEARL_ACCOUNT_ID is ignored. Set NLPEARL_API_KEY to the secret only, or set NLPEARL_API_KEY to the full real accountId:secret from NLPearl (not the word AccountId). Regenerate key if unsure."
            : "NLPearl API rejected auth (401/403) — Account ID or secret wrong, revoked, or from a different workspace than NLPEARL_OUTBOUND_ID. In NLPearl: Settings → Account details (ID) + new API key (secret only in Vercel). Redeploy after env change.",
        );
      } else if (res.status === 404) {
        base.issues.push(
          "NLPearl outbound ID not found (404) — confirm NLPEARL_OUTBOUND_ID matches Pearl ID in platform.",
        );
      } else if (res.status === 400) {
        base.issues.push(
          "NLPearl API reachable (400 on empty phone) — key + outbound ID likely OK; check Pearl Live, calling hours, and assigned phone number.",
        );
      } else if (!res.ok) {
        base.issues.push(`NLPearl API error HTTP ${res.status} — check Pearl Live + phone number assigned.`);
      }
    } catch (e) {
      nlpearlApiProbe = {
        httpStatus: 0,
        ok: false,
        bodyPreview: String(e),
        hint: "network_error",
      };
      base.issues.push("Could not reach api.nlpearl.ai from Vercel.");
    }
  }

  return NextResponse.json({
    ok: base.issues.length === 0,
    ...base,
    auth: authOk,
    nlpearlApiProbe,
  });
}

function probeHint(status: number, body: string): string {
  if (status === 401 || status === 403) return "invalid_auth_account_or_secret";
  if (status === 404) return "invalid_outbound_id";
  if (status === 400) return "api_reachable_bad_request";
  if (status >= 200 && status < 300) return "call_may_have_been_accepted";
  if (body.toLowerCase().includes("schedule")) return "outside_calling_hours";
  return "unknown";
}
