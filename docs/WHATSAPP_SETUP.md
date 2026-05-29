# WhatsApp Business API — Setup (Momentum)

## 1. Meta Business

1. Create a [Meta Business](https://business.facebook.com/) account.
2. Add **WhatsApp** → connect a **business phone number** (not personal WhatsApp).
3. In [Meta for Developers](https://developers.facebook.com/), create an app → add **WhatsApp** product.
4. Copy **Phone number ID**, generate a **permanent access token** (System User recommended).

## 2. Webhook (Vercel)

**Callback URL:** `https://moomentum.events/api/webhooks/whatsapp`

**Verify token:** same as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Vercel.

Subscribe to: `messages` (and `message_template_status_update` optional).

## 3. Approved templates (Hebrew)

Create in WhatsApp Manager → Message templates. Suggested names (override via env):

| Env | Template name | Body (example) | Buttons |
|-----|---------------|----------------|---------|
| `WHATSAPP_TEMPLATE_RSVP` | `rsvp_confirm` | שלום {{1}}, האם תגיע/י ל{{2}}? | Quick reply: מגיע/ה (`rsvp_yes`), לא מגיע/ה (`rsvp_no`), עדיין לא החלטתי (`rsvp_maybe`) |
| `WHATSAPP_TEMPLATE_SEATING` | `seat_assignment` | {{1}}, מקומך: {{2}} | — |
| `WHATSAPP_TEMPLATE_VENDOR_LEAD` | `vendor_new_lead` | ליד חדש: {{1}}, טלפון {{2}}, {{3}} | — |
| `WHATSAPP_TEMPLATE_DAILY_DIGEST` | `daily_digest` | שלום {{1}}, {{2}}: {{3}} | — |

Button **payload** IDs must match `WHATSAPP_BTN_RSVP_*` env vars (defaults: `rsvp_yes`, `rsvp_no`, `rsvp_maybe`).

## 4. Environment variables (Vercel)

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_API_VERSION=v21.0
WHATSAPP_TEMPLATE_RSVP=rsvp_confirm
WHATSAPP_TEMPLATE_SEATING=seat_assignment
WHATSAPP_TEMPLATE_VENDOR_LEAD=vendor_new_lead
WHATSAPP_TEMPLATE_DAILY_DIGEST=daily_digest
CRON_SECRET=
```

Also required: `SUPABASE_SERVICE_ROLE_KEY`, NLPearl vars for 48h voice fallback cron.

## 5. Supabase migration

Run `supabase/migrations/2026-05-21-whatsapp-business.sql` on the client project.

## 6. Testing

1. Add your phone as a **test recipient** in Meta developer console.
2. Deploy to **Preview** with env vars set.
3. `/guests` → **שלח אישורי הגעה** → confirm send.
4. On your phone, tap a quick-reply button → check `/guests` updates within seconds.
5. Webhook logs: Vercel → Functions → `/api/webhooks/whatsapp`.

Without approved templates, sends return `configured: false` in the API (same pattern as NLPearl).
