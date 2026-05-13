import { StartClient } from "./StartClient";

export const metadata = {
  title: "בחר מסלול — Momentum",
  description: "לפני שיוצאים לדרך, בחר את המסלול שמתאים לך.",
};

/**
 * Pricing gate route. Server component so we can keep the static `metadata`
 * export — Next 16 disallows it from `"use client"` files. The interactive
 * tier-picker UI lives in `./StartClient`.
 */
export default function StartPage() {
  return <StartClient />;
}
