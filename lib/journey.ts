import type { AppState } from "./types";
import { EVENT_CONFIG, type JourneyStepDef } from "./eventConfig";

function isComplete(step: JourneyStepDef, state: AppState): boolean {
  switch (step.completeBy) {
    case "hasEvent":
      return !!state.event;
    case "hasVendors":
      return state.selectedVendors.length >= 1;
    case "hasInvited":
      return state.guests.some((g) => g.status === "invited" || g.status === "confirmed");
    case "hasBudget":
      return state.budget.length >= 3;
    case "hasResponses":
      return state.guests.some((g) => g.status === "confirmed" || g.status === "declined");
    case "hasChecklistProgress":
      return state.checklist.filter((c) => c.done).length >= 3;
    case "hasSeating":
      return state.tables.length > 0 && Object.keys(state.seatAssignments).length >= 1;
    case "hasEnvelopes":
      return state.guests.some((g) => g.envelopeAmount && g.envelopeAmount > 0);
    default:
      return false;
  }
}

function isUnlocked(step: JourneyStepDef, state: AppState): boolean {
  switch (step.unlockBy) {
    case "always":
      return true;
    case "afterEvent":
      return !!state.event;
    case "afterGuests":
      return state.guests.length > 0;
    default:
      return true;
  }
}

export interface JourneyStepStatus {
  def: JourneyStepDef;
  order: number;
  unlocked: boolean;
  complete: boolean;
}

export function getJourneyForState(state: AppState): JourneyStepStatus[] {
  const type = state.event?.type ?? "wedding";
  // R17: some event types (e.g. "other", or any future enum value seeded
  // before its config landed) won't have an entry in EVENT_CONFIG. Fall
  // back to the wedding journey rather than crashing on `.journey` of
  // undefined — every page that renders the journey expects a valid array.
  const steps = (EVENT_CONFIG[type] ?? EVENT_CONFIG.wedding).journey;
  return steps.map((def, i) => ({
    def,
    order: i + 1,
    unlocked: isUnlocked(def, state),
    complete: isComplete(def, state),
  }));
}

export function getProgress(state: AppState) {
  const journey = getJourneyForState(state);
  const total = journey.length;
  const done = journey.filter((s) => s.complete).length;
  return { done, total, percent: Math.round((done / Math.max(1, total)) * 100) };
}
