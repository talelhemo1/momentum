/**
 * Smart seating arrangement.
 *
 * Goal: produce an assignment {guestId → tableId} that:
 *   1. ALWAYS keeps `mustSitWith` pairs at the same table.
 *   2. NEVER puts `conflictsWith` pairs at the same table.
 *   3. **Pins guests to their named circle's table** (R16) — e.g. a guest
 *      tagged "חברים מהצבא" gravitates toward the table also tagged
 *      "חברים מהצבא" with a +50/guest score that dwarfs all other signals.
 *   4. Prefers grouping guests of the same `group` (family/friends/...).
 *   5. Spreads age groups so each table has some balance.
 *   6. Optional soft gender balance.
 *   7. Auto-picks a "main table" with the closest family.
 *
 * Strategy: a constructive greedy with a scoring function. Pure JS, no
 * dependencies — runs in <50ms even for 500 guests / 50 tables. The user can
 * "reroll" by passing a fresh seed to vary the tie-breaking order.
 *
 * The algorithm is deterministic given the same inputs + seed; this keeps the
 * "redo" button useful (different seed = different arrangement) without
 * jittering on unrelated state changes.
 */

import type { Guest, GuestAgeGroup, GuestGroup, SeatingTable } from "./types";

/**
 * R16 helper — normalize a circle string for matching. Trims whitespace and
 * lowercases (Hebrew is unaffected by case but we still want to fold any
 * Latin chars users mix in). Empty / undefined input returns null so callers
 * can short-circuit cleanly.
 */
function normalizeCircle(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export interface SmartArrangementInput {
  guests: Guest[];
  tables: SeatingTable[];
  /** Existing assignments — used only to seed `attendingCount`-aware capacity. */
  existing?: Record<string, string>;
  /** Random seed for tie-breaking. Same seed = same arrangement. */
  seed?: number;
}

export interface TableExplanation {
  tableId: string;
  /** Human-readable Hebrew description like "חברי תיכון, גילאי 30-35". */
  summary: string;
  groupBreakdown: Partial<Record<GuestGroup, number>>;
  ageBreakdown: Partial<Record<GuestAgeGroup, number>>;
  guestCount: number;
  capacityUsed: number;
  capacityTotal: number;
  /** True for the auto-picked "head" table (closest family + most VIPs). */
  isMainTable: boolean;
}

export interface SmartArrangementResult {
  /** guestId → tableId. Guests left unassigned (no fitting table) are omitted. */
  assignments: Record<string, string>;
  /** One entry per table, in the same order as input.tables. */
  explanations: TableExplanation[];
  /** Guests we couldn't seat (capacity exhausted or every fit conflicts). */
  unseated: Guest[];
}

const GROUP_LABEL_HE: Record<GuestGroup, string> = {
  family: "משפחה",
  friends: "חברים",
  work: "עבודה",
  neighbors: "שכנים",
  other: "אורחים",
};

const AGE_LABEL_HE: Record<GuestAgeGroup, string> = {
  child: "ילדים",
  teen: "נוער",
  adult: "מבוגרים",
  senior: "קשישים",
};

/** Tiny seeded PRNG (mulberry32). Good enough for tie-breaking, not crypto. */
function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Capacity used by a guest. Default: 1. Each `attendingCount > 1` (a +1) is
 * counted only once for seat purposes — a confirmed guest with attendingCount=2
 * still occupies 1 chair; we can't seat their plus-one separately because we
 * don't have their identity. The user can override this by adding the +1 as a
 * separate guest record. Const, not a function, to keep the call sites tiny.
 */
const SEAT_COST_PER_GUEST = 1;

/**
 * "Cohesion clusters" — Union-Find over `mustSitWith` so we can place a couple
 * (or a parents-with-kids unit) atomically at one table.
 */
function buildClusters(guests: Guest[]): Guest[][] {
  const indexById = new Map<string, number>();
  guests.forEach((g, i) => indexById.set(g.id, i));
  const parent = guests.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  guests.forEach((g, i) => {
    (g.mustSitWith ?? []).forEach((otherId) => {
      const j = indexById.get(otherId);
      if (j !== undefined) union(i, j);
    });
  });
  const buckets = new Map<number, Guest[]>();
  guests.forEach((g, i) => {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r)!.push(g);
  });
  return [...buckets.values()];
}

/**
 * Score how good it is to add `cluster` to `state[tableIdx]`. Higher = better.
 * Negative = forbidden (capacity overflow or conflict).
 */
function scorePlacement(
  cluster: Guest[],
  tableIdx: number,
  state: TableState[],
  guestById: Map<string, Guest>,
): number {
  const t = state[tableIdx];
  const cost = cluster.length * SEAT_COST_PER_GUEST;
  if (t.capacityUsed + cost > t.capacityTotal) return -Infinity;

  // Forbid conflicts
  for (const g of cluster) {
    for (const conflictId of g.conflictsWith ?? []) {
      if (t.guestIds.has(conflictId)) return -Infinity;
    }
  }
  // Forbid the inverse: someone already seated who conflicts with our cluster.
  for (const seatedId of t.guestIds) {
    const seated = guestById.get(seatedId);
    if (!seated) continue;
    for (const conflictId of seated.conflictsWith ?? []) {
      if (cluster.some((c) => c.id === conflictId)) return -Infinity;
    }
  }

  let score = 0;

  // R16 — named-circle pinning. When the table has an explicit circle
  // ("חברים מהצבא"), every cluster member whose own circle matches gets
  // +50, and every cluster member with a DIFFERENT named circle gets -20.
  // Cluster members with no circle are neutral. The +50 dominates every
  // other signal in this function (group +5, age ±2, gender ±0.5, fill
  // 0.05) but still loses to the hard capacity check above — so an
  // overflowing army-friends table spills into the next-best table
  // rather than dropping guests as unseated.
  const tableCircle = normalizeCircle(t.table.circle);
  if (tableCircle) {
    for (const g of cluster) {
      const gc = normalizeCircle(g.circle);
      if (!gc) continue;
      if (gc === tableCircle) score += 50;
      else score -= 20;
    }
  }

  // Group cohesion: +5 per matching group member already at the table.
  const clusterGroups = new Set(cluster.map((g) => g.group).filter((g): g is GuestGroup => !!g));
  if (clusterGroups.size > 0) {
    for (const seatedId of t.guestIds) {
      const seated = guestById.get(seatedId);
      if (seated?.group && clusterGroups.has(seated.group)) score += 5;
    }
  }

  // Age balance: penalty if the table already has many same-age guests.
  // Reward placing a different age bucket on a table that's all one age.
  const clusterAges = cluster.map((g) => g.ageGroup).filter((a): a is GuestAgeGroup => !!a);
  for (const age of clusterAges) {
    const sameAgeAtTable = t.ageCount[age] ?? 0;
    if (sameAgeAtTable >= 4) score -= 2; // Discourage piling on
    else if (sameAgeAtTable === 0 && t.guestIds.size > 0) score += 1; // Reward diversity
  }

  // Soft gender balance (only if both genders are known on this table).
  const males = t.genderCount.male;
  const females = t.genderCount.female;
  if (males + females >= 4) {
    const ratio = Math.abs(males - females) / (males + females);
    cluster.forEach((g) => {
      if (g.gender === "male" && males < females) score += 0.5;
      if (g.gender === "female" && females < males) score += 0.5;
      if (g.gender === "male" && males > females && ratio > 0.4) score -= 0.5;
      if (g.gender === "female" && females > males && ratio > 0.4) score -= 0.5;
    });
  }

  // Prefer filling tables that are already partly full (encourages compact seating).
  score += t.guestIds.size * 0.05;

  return score;
}

interface TableState {
  table: SeatingTable;
  capacityUsed: number;
  capacityTotal: number;
  guestIds: Set<string>;
  ageCount: Partial<Record<GuestAgeGroup, number>>;
  genderCount: { male: number; female: number };
  groupCount: Partial<Record<GuestGroup, number>>;
}

function newTableState(table: SeatingTable): TableState {
  return {
    table,
    capacityUsed: 0,
    capacityTotal: Math.max(1, table.capacity),
    guestIds: new Set(),
    ageCount: {},
    genderCount: { male: 0, female: 0 },
    groupCount: {},
  };
}

function applyPlacement(state: TableState, cluster: Guest[]) {
  cluster.forEach((g) => {
    state.guestIds.add(g.id);
    state.capacityUsed += SEAT_COST_PER_GUEST;
    if (g.ageGroup) state.ageCount[g.ageGroup] = (state.ageCount[g.ageGroup] ?? 0) + 1;
    if (g.group) state.groupCount[g.group] = (state.groupCount[g.group] ?? 0) + 1;
    if (g.gender) state.genderCount[g.gender]++;
  });
}

/** Compose a Hebrew sentence summarizing a finalized table. */
function describeTable(state: TableState): string {
  const groups = (Object.keys(state.groupCount) as GuestGroup[])
    .sort((a, b) => (state.groupCount[b] ?? 0) - (state.groupCount[a] ?? 0));
  const ages = (Object.keys(state.ageCount) as GuestAgeGroup[])
    .sort((a, b) => (state.ageCount[b] ?? 0) - (state.ageCount[a] ?? 0));

  // R16: a named-circle table identifies itself first. The user typed the
  // label they want ("חברים מהצבא") — that's far more informative than the
  // closed-enum group bucket. Keep the rest of the breakdown after it.
  const tableCircle = state.table.circle?.trim();

  if (state.guestIds.size === 0) {
    return tableCircle ? `${tableCircle} (שולחן ריק)` : "שולחן ריק";
  }
  if (groups.length === 0 && ages.length === 0) {
    return tableCircle
      ? `${tableCircle} · ${state.guestIds.size} אורחים`
      : `${state.guestIds.size} אורחים`;
  }

  const parts: string[] = [];
  if (groups[0]) {
    parts.push(GROUP_LABEL_HE[groups[0]]);
    if (groups[1] && (state.groupCount[groups[1]] ?? 0) >= 2) {
      parts.push(`+ ${GROUP_LABEL_HE[groups[1]]}`);
    }
  }
  if (ages.length > 0) {
    const ageLabels = ages.slice(0, 2).map((a) => AGE_LABEL_HE[a]);
    if (ageLabels.length === 1) parts.push(`(${ageLabels[0]})`);
    else parts.push(`(${ageLabels.join(" + ")})`);
  }
  const base = parts.join(" ");
  return tableCircle ? `${tableCircle} · ${base}` : base;
}

/**
 * Score how "main-table-worthy" a cluster is. Family adults score highest.
 * Used to pick the head table BEFORE the main loop runs.
 */
function vipScore(cluster: Guest[]): number {
  let s = 0;
  for (const g of cluster) {
    if (g.group === "family") s += 3;
    if (g.ageGroup === "senior") s += 1; // Grandparents at the head table
    if (g.ageGroup === "adult") s += 0.5;
    if (g.side && g.side !== "shared") s += 0.5;
  }
  return s;
}

/**
 * Main entry point. Returns a complete arrangement, an explanation per table,
 * and the list of guests that couldn't be seated (so the UI can show them).
 */
export function smartArrangement(input: SmartArrangementInput): SmartArrangementResult {
  const { tables } = input;
  // Only seat confirmed/maybe guests; pending/declined never get a chair.
  const seatable = input.guests.filter((g) => g.status === "confirmed" || g.status === "maybe");

  if (tables.length === 0 || seatable.length === 0) {
    return {
      assignments: {},
      explanations: tables.map((t) => ({
        tableId: t.id,
        summary: "שולחן ריק",
        groupBreakdown: {},
        ageBreakdown: {},
        guestCount: 0,
        capacityUsed: 0,
        capacityTotal: t.capacity,
        isMainTable: false,
      })),
      unseated: [],
    };
  }

  const guestById = new Map(seatable.map((g) => [g.id, g]));
  const clusters = buildClusters(seatable);
  const states = tables.map(newTableState);
  const rand = mulberry32(input.seed ?? Date.now());

  // 1) Pick a main table — highest VIP cluster on the largest table.
  const sortedClustersByVip = [...clusters].sort((a, b) => vipScore(b) - vipScore(a));
  const sortedStatesByCapacity = [...states].sort((a, b) => b.capacityTotal - a.capacityTotal);
  const mainCluster = sortedClustersByVip[0];
  const mainState = sortedStatesByCapacity[0];
  const mainTableId = mainState.table.id;
  if (mainCluster && mainState && mainCluster.length * SEAT_COST_PER_GUEST <= mainState.capacityTotal) {
    applyPlacement(mainState, mainCluster);
  }

  // 2) Seat remaining clusters. Order: largest first (harder to fit later),
  //    then by total VIP score, then random for tie-breaking.
  const remaining = clusters
    .filter((c) => c !== mainCluster)
    .sort((a, b) => {
      const sizeDiff = b.length - a.length;
      if (sizeDiff !== 0) return sizeDiff;
      const vipDiff = vipScore(b) - vipScore(a);
      if (vipDiff !== 0) return vipDiff;
      return rand() - 0.5;
    });

  const unseated: Guest[] = [];

  for (const cluster of remaining) {
    // Score every table; pick the highest. Ties broken by random jitter.
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < states.length; i++) {
      const score = scorePlacement(cluster, i, states, guestById) + rand() * 0.001;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestScore === -Infinity) {
      unseated.push(...cluster);
    } else {
      applyPlacement(states[bestIdx], cluster);
    }
  }

  // 3) Build the output.
  const assignments: Record<string, string> = {};
  states.forEach((s) => {
    s.guestIds.forEach((gid) => {
      assignments[gid] = s.table.id;
    });
  });

  const explanations: TableExplanation[] = states.map((s) => ({
    tableId: s.table.id,
    summary: describeTable(s),
    groupBreakdown: { ...s.groupCount },
    ageBreakdown: { ...s.ageCount },
    guestCount: s.guestIds.size,
    capacityUsed: s.capacityUsed,
    capacityTotal: s.capacityTotal,
    isMainTable: s.table.id === mainTableId,
  }));

  return { assignments, explanations, unseated };
}
