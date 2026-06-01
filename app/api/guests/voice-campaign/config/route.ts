import "server-only";

import { NextResponse } from "next/server";
import { isNlpearlVoiceTestBypassEnabled } from "@/lib/voiceRsvpFromCall";

export const dynamic = "force-dynamic";

/** Whether the guests UI may offer NLPearl test calls without the 2-WhatsApp gate. */
export async function GET() {
  return NextResponse.json({
    testBypassAvailable: isNlpearlVoiceTestBypassEnabled(),
    testMaxGuests: 1,
  });
}
