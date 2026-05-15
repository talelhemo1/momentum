/**
 * R22 §B — "3 AI price proposals".
 *
 * Pure, deterministic split engine + a thin async wrapper that prefers
 * the AI endpoint and falls back to this engine when OpenAI isn't
 * configured or the call fails. All money here is in **shekels** (the
 * brief's PackageInputs uses ₪, not agorot).
 */
import type { EventType } from "@/lib/types";

export type Priority =
  | "food"
  | "venue"
  | "vibe"
  | "music"
  | "photo"
  | "decor";

export const PRIORITY_LABELS: Record<Priority, string> = {
  food: "אוכל",
  venue: "אולם",
  vibe: "וייב",
  music: "מוזיקה",
  photo: "צילום",
  decor: "עיצוב",
};

export interface PackageInputs {
  budget_total: number; // ₪
  guests_count: number;
  event_type: EventType;
  priorities: Priority[]; // exactly 3
}

export interface PackageBreakdown {
  food: number;
  venue: number;
  music: number;
  photography: number;
  decor: number;
  alcohol: number;
}

export interface PackageProposal {
  name: string;
  emoji: string;
  per_guest: number; // ₪
  total: number; // ₪
  pros: string[];
  cons: string[];
  breakdown: PackageBreakdown;
  vibe_score: number; // 1-10
}

export interface PackagesResult {
  packages: PackageProposal[]; // exactly 3
  recommendation: string;
  source: "ai" | "fallback";
}

type Bucket = keyof PackageBreakdown;

/** Three base personalities — fractions of the total, each sums to ~1. */
const BASE_PROFILES: Array<{
  name: string;
  emoji: string;
  split: Record<Bucket, number>;
}> = [
  {
    name: "המסעדה",
    emoji: "🍽️",
    split: { food: 0.42, venue: 0.22, alcohol: 0.1, photography: 0.1, music: 0.09, decor: 0.07 },
  },
  {
    name: "הוואיב",
    emoji: "🎉",
    split: { music: 0.2, decor: 0.16, alcohol: 0.14, venue: 0.22, food: 0.2, photography: 0.08 },
  },
  {
    name: "המקום",
    emoji: "🏛️",
    split: { venue: 0.4, food: 0.26, photography: 0.12, alcohol: 0.09, music: 0.08, decor: 0.05 },
  },
];

/** Which breakdown buckets a user priority maps onto. */
const PRIORITY_TO_BUCKETS: Record<Priority, Bucket[]> = {
  food: ["food"],
  venue: ["venue"],
  music: ["music"],
  photo: ["photography"],
  decor: ["decor"],
  vibe: ["music", "decor", "alcohol"],
};

function tiltAndNormalize(
  split: Record<Bucket, number>,
  priorities: Priority[],
): Record<Bucket, number> {
  const out = { ...split };
  for (const p of priorities) {
    for (const b of PRIORITY_TO_BUCKETS[p]) out[b] += 0.05;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  (Object.keys(out) as Bucket[]).forEach((k) => {
    out[k] = out[k] / sum;
  });
  return out;
}

function toBreakdown(
  split: Record<Bucket, number>,
  total: number,
): PackageBreakdown {
  const keys = Object.keys(split) as Bucket[];
  const raw = keys.map((k) => Math.round(split[k] * total));
  // Push the rounding remainder onto the biggest bucket so the parts
  // always sum exactly to `total`.
  const diff = total - raw.reduce((a, b) => a + b, 0);
  let maxIdx = 0;
  raw.forEach((v, i) => {
    if (v > raw[maxIdx]) maxIdx = i;
  });
  raw[maxIdx] += diff;
  const bd = {} as PackageBreakdown;
  keys.forEach((k, i) => {
    bd[k] = raw[i];
  });
  return bd;
}

const PROS_BY_BUCKET: Record<Bucket, { hi: string; lo: string }> = {
  food: {
    hi: "קייטרינג שף — מנה ראשונה + עיקרית + קינוח",
    lo: "תפריט מצומצם — מנה עיקרית אחת",
  },
  venue: {
    hi: "אולם מהשורה הראשונה במיקום מרכזי",
    lo: "אולם בסיסי / גן אירועים פשוט",
  },
  music: {
    hi: "DJ מוביל או להקה חיה",
    lo: "DJ סטנדרטי בלבד",
  },
  photography: {
    hi: "צלם דרגה 1 + וידאו מלא",
    lo: "צלם בסיסי, בלי וידאו",
  },
  decor: {
    hi: "עיצוב ופרחים עשירים בכל החללים",
    lo: "עיצוב פרחים בסיסי",
  },
  alcohol: {
    hi: "בר פתוח מלא לאורך כל האירוע",
    lo: "בר מוגבל / יין על השולחנות בלבד",
  },
};

function prosCons(bd: PackageBreakdown, total: number) {
  const pros: string[] = [];
  const cons: string[] = [];
  (Object.keys(bd) as Bucket[]).forEach((k) => {
    const share = total > 0 ? bd[k] / total : 0;
    if (share >= 0.18) pros.push(PROS_BY_BUCKET[k].hi);
    else if (share <= 0.08) cons.push(PROS_BY_BUCKET[k].lo);
  });
  // Guarantee a sensible minimum so cards never look empty.
  if (pros.length < 4) {
    pros.push("גמיש — אפשר להזיז תקציב בין הקטגוריות");
  }
  if (cons.length < 3) {
    cons.push("פחות מרווח לתוספות של הרגע האחרון");
  }
  return { pros: pros.slice(0, 5), cons: cons.slice(0, 4) };
}

function vibeScore(bd: PackageBreakdown, total: number): number {
  if (total <= 0) return 5;
  const s =
    (bd.music * 0.4 +
      bd.decor * 0.3 +
      bd.alcohol * 0.2 +
      bd.venue * 0.1) /
    total;
  return Math.min(10, Math.max(1, Math.round(s * 28)));
}

/** The deterministic engine — always available, no network. */
export function computePackagesFallback(
  inputs: PackageInputs,
): PackagesResult {
  const total = Math.max(0, Math.round(inputs.budget_total));
  const guests = Math.max(1, inputs.guests_count);

  const packages: PackageProposal[] = BASE_PROFILES.map((profile) => {
    const split = tiltAndNormalize(profile.split, inputs.priorities);
    const breakdown = toBreakdown(split, total);
    const { pros, cons } = prosCons(breakdown, total);
    return {
      name: profile.name,
      emoji: profile.emoji,
      per_guest: Math.round(total / guests),
      total,
      pros,
      cons,
      breakdown,
      vibe_score: vibeScore(breakdown, total),
    };
  });

  // Recommend the package whose spend best matches the user's priorities.
  const priorityBuckets = new Set<Bucket>(
    inputs.priorities.flatMap((p) => PRIORITY_TO_BUCKETS[p]),
  );
  let best = 0;
  let bestScore = -1;
  packages.forEach((pkg, i) => {
    const score = [...priorityBuckets].reduce(
      (acc, b) => acc + pkg.breakdown[b],
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return {
    packages,
    recommendation: `לפי העדיפויות שלך — חבילה "${packages[best].name}" מתאימה ביותר.`,
    source: "fallback",
  };
}

/**
 * Prefer the AI endpoint; transparently fall back to the deterministic
 * engine on 503 (no key) / any error so the UI always has 3 proposals.
 */
export async function getAiPackages(
  inputs: PackageInputs,
  accessToken?: string,
): Promise<PackagesResult> {
  try {
    const res = await fetch("/api/ai/packages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(inputs),
    });
    if (!res.ok) return computePackagesFallback(inputs);
    const data = (await res.json()) as PackagesResult;
    if (!Array.isArray(data.packages) || data.packages.length !== 3) {
      return computePackagesFallback(inputs);
    }
    return { ...data, source: "ai" };
  } catch {
    return computePackagesFallback(inputs);
  }
}
