"use client";

import { STORAGE_KEYS } from "@/lib/storage-keys";

/**
 * R26 — Momentum Live alert sounds.
 *
 * Synthesized with the Web Audio API instead of bundling .mp3 assets:
 * zero network, tiny, and the tones can stay deliberately *subtle*
 * (luxury, not arcade). Off by default; the manager opts in from
 * Settings. Every call is a no-op when disabled or when the browser
 * has no AudioContext.
 */

type SoundKind = "checkin" | "alert" | "crisis";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

export function managerSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.managerSounds) === "1";
  } catch {
    return false;
  }
}

export function setManagerSoundsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.managerSounds, on ? "1" : "0");
  } catch {
    /* private mode — in-memory only for this session */
  }
}

/** One short sine "blip". Gentle attack + exponential release. */
function blip(
  audio: AudioContext,
  freq: number,
  startAt: number,
  durMs: number,
  peak = 0.06,
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durMs / 1000);
  osc.connect(gain).connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + durMs / 1000 + 0.02);
}

export function playManagerSound(kind: SoundKind): void {
  if (!managerSoundsEnabled()) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    if (kind === "checkin") {
      // Pleasant rising two-note "ding".
      blip(audio, 660, t, 110);
      blip(audio, 990, t + 0.09, 150);
    } else if (kind === "alert") {
      // Soft single "pop".
      blip(audio, 520, t, 120, 0.05);
    } else {
      // Crisis — three urgent low pulses.
      blip(audio, 320, t, 90, 0.08);
      blip(audio, 320, t + 0.14, 90, 0.08);
      blip(audio, 320, t + 0.28, 120, 0.08);
    }
  } catch {
    /* audio routing failed — silent */
  }
}
