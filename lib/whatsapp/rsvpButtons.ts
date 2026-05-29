import "server-only";

export {
  rsvpStatusFromButton,
  isFinalRsvpStatus,
  DEFAULT_RSVP_BUTTON_PAYLOADS,
} from "./rsvpButtonMap";

import { getWhatsAppConfig } from "./config";
import { rsvpStatusFromButton as mapButton } from "./rsvpButtonMap";

/** Server webhook — uses env-configured button payload IDs. */
export function rsvpStatusFromWebhookButton(payloadOrText: string) {
  return mapButton(payloadOrText, getWhatsAppConfig().buttonPayloads);
}
