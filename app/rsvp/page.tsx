import type { Metadata } from "next";
import RsvpClient from "./RsvpClient";

/**
 * /rsvp is split into a tiny server component (this file) that emits static
 * metadata, and a client component (`RsvpClient.tsx`) that handles all the
 * interactive flow. The split predates and outlives the AI-invitation
 * feature — keep it.
 */
export const metadata: Metadata = {
  title: "הזמנה לאירוע",
  description: "אישור הגעה — לחץ כדי לאשר",
  openGraph: {
    title: "הוזמנת לאירוע מיוחד",
    description: "לחץ כדי לאשר הגעה",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "הוזמנת לאירוע",
  },
};

export default function Page() {
  return <RsvpClient />;
}
