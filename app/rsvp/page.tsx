import type { Metadata } from "next";
import RsvpClient from "./RsvpClient";

/**
 * /rsvp is split into a tiny server component (this file) that emits static
 * metadata, and a client component (`RsvpClient.tsx`) that handles all the
 * interactive flow. The split predates and outlives the AI-invitation
 * feature — keep it.
 */
// R32 — a page-level metadata block replaces the root openGraph, so
// /rsvp must re-declare the static brand image or its WhatsApp/social
// preview would render image-less.
const OG_IMAGE = {
  url: "/og-default-1200x630.png?v=2",
  width: 1200,
  height: 630,
  alt: "Momentum — מומנטום אירועים",
};

export const metadata: Metadata = {
  title: "הזמנה לאירוע",
  description: "אישור הגעה — לחץ כדי לאשר",
  openGraph: {
    title: "הוזמנת לאירוע מיוחד",
    description: "לחץ כדי לאשר הגעה",
    type: "website",
    locale: "he_IL",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "הוזמנת לאירוע",
    images: ["/og-default-1200x630.png?v=2"],
  },
};

export default function Page() {
  return <RsvpClient />;
}
