"use client";

import dynamic from "next/dynamic";

/**
 * R166 — code-split the AI assistant out of the shared first-load bundle.
 *
 * The widget is mounted globally in the root layout, but it self-gates
 * visibility (returns null on /, /signup, /rsvp, and other signed-out
 * surfaces) and only matters on the signed-in planning pages. Statically
 * importing it dragged getSupabase + the assistant/AI libs into the JS
 * that EVERY visitor downloads — including the marketing landing.
 *
 * Loading it through next/dynamic puts it in its own chunk that's fetched
 * lazily on the client. `ssr: false` is allowed here because this is a
 * Client Component (the root layout is a Server Component, where it
 * isn't). The widget has no SSR-visible output anyway (it's a floating
 * launcher), so there's no layout shift.
 */
const AssistantWidget = dynamic(
  () =>
    import("./AssistantWidget").then((m) => ({ default: m.AssistantWidget })),
  { ssr: false },
);

export function DeferredAssistant() {
  return <AssistantWidget />;
}
