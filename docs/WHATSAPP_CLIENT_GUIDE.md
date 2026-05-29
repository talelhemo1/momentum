# WhatsApp setup guide (for Momentum client)

Step-by-step: where to get each item Meta / WhatsApp needs.  
Technical reference for developers: [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md)

---

## Before you start

- Use a **Meta Business** account (not a personal Facebook profile only).
- Connect a **business phone number** to WhatsApp Business API (not the same as WhatsApp on your private phone).
- Deploy the Momentum branch on **Vercel Preview** first and run the Supabase migration (your developer will send the file name).

---

## A. Where to get the API credentials

### 1. Open Meta for Developers

1. Go to https://developers.facebook.com/
2. Log in with the Business account that owns the app.
3. Open **My Apps** → select your app (or **Create App** → type **Business** → add **WhatsApp** product).

### 2. Access token + Phone number ID

1. In the left menu: **WhatsApp** → **API Setup** (sometimes labeled **Getting Started**).
2. On that page you will see:
   - **Phone number ID** — long number (copy it).  
     → Goes in Vercel as `WHATSAPP_PHONE_NUMBER_ID`
   - **Temporary access token** — for quick tests only (expires in 24h).
3. For **production**, create a **permanent token**:
   - **Business Settings** (business.facebook.com) → **Users** → **System users** → Add system user → **Generate token**
   - Select your app, enable **whatsapp_business_messaging** (and **whatsapp_business_management** if needed).
   - Copy the token (starts with `EAA…`, very long).  
     → Goes in Vercel as `WHATSAPP_ACCESS_TOKEN`

**Send your developer both:** Access token + Phone number ID.

### 3. App Secret (optional but recommended)

1. **developers.facebook.com** → your app → **App settings** → **Basic**
2. Click **Show** next to **App secret** (32-character hex).  
   → Goes in Vercel as `WHATSAPP_APP_SECRET`

### 4. Webhook verify token (you choose this)

- Pick any random secret string (e.g. `momentum-wa-verify-2026`).
- You will enter the **same** string in:
  - Vercel → `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - Meta → WhatsApp → **Configuration** → Webhook → Verify token

---

## B. Approved message templates

### Where

1. https://business.facebook.com/ → **WhatsApp Manager** (or from the app: **WhatsApp** → **Message templates**).
2. **Account tools** → **Message templates** → **Create template**.

### Template 1 — RSVP (required first)

| Field | What to enter |
|--------|----------------|
| Category | **Utility** (or Marketing if Meta requires; Utility is usual for RSVP) |
| Name | `rsvp_confirm` (must match what developer sets in Vercel, or tell them your exact name) |
| Language | **Hebrew** |
| Body | Example: `שלום {{1}}, האם תגיע/י ל{{2}}?` |
| Buttons | **Quick reply** × 3: `מגיע/ה` · `לא מגיע/ה` · `עדיין לא החלטתי` |

**Important for buttons:** In advanced / button settings, set **payload** IDs if Meta asks:

- `rsvp_yes` · `rsvp_no` · `rsvp_maybe`

Submit → wait until status is **Approved** (not Pending).

### Template 2 — Seating (when ready)

- Name: `seat_assignment`
- Body example: `{{1}}, מקומך באירוע: {{2}}`

### Template 3 — Vendor lead (when ready)

- Name: `vendor_new_lead`
- Body example: `ליד חדש מ-Momentum: {{1}}, טלפון {{2}}, {{3}}`

### Template 4 — Daily digest (optional)

- Name: `daily_digest`
- Body example: `שלום {{1}}, {{2}}`

Tell your developer the **exact template names** you used if they differ from the table above.

---

## C. Configure the webhook (so guest button taps update the dashboard)

### 1. Public URL

Use **Preview** first, then production:

| Environment | Webhook URL |
|-------------|-------------|
| Production | `https://moomentum.events/api/webhooks/whatsapp` |
| Vercel Preview | `https://YOUR-PREVIEW-NAME.vercel.app/api/webhooks/whatsapp` |

### 2. In Meta Developer Console

1. **WhatsApp** → **Configuration** (left menu).
2. **Webhook** section → **Edit**.
3. **Callback URL:** paste the URL from the table above.
4. **Verify token:** same secret as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Vercel.
5. Click **Verify and save** (Meta calls your site once; it must be deployed with env vars set).
6. **Webhook fields** → Subscribe to **messages** (check the box) → Save.

---

## D. What to put in Vercel (Preview → then Production)

Settings → Environment Variables:

```
WHATSAPP_ACCESS_TOKEN=        (from API Setup / System user token)
WHATSAPP_PHONE_NUMBER_ID=     (from API Setup)
WHATSAPP_WEBHOOK_VERIFY_TOKEN= (you invented this)
WHATSAPP_APP_SECRET=          (from App settings → Basic)
WHATSAPP_TEMPLATE_RSVP=rsvp_confirm
WHATSAPP_TEMPLATE_SEATING=seat_assignment
WHATSAPP_TEMPLATE_VENDOR_LEAD=vendor_new_lead
WHATSAPP_TEMPLATE_DAILY_DIGEST=daily_digest
CRON_SECRET=                  (same as your other cron jobs)
SUPABASE_SERVICE_ROLE_KEY=    (already should exist)
```

Redeploy after saving variables.

---

## E. Test numbers (before going live)

1. **developers.facebook.com** → your app → **WhatsApp** → **API Setup**
2. Under **To**, add phone numbers of people who will test (your number + developer’s).
3. Only those numbers receive messages until the app is in **Live** mode.

---

## F. Checklist to send back to developer

- [ ] Access token (permanent `EAA…`)
- [ ] Phone number ID
- [ ] App secret (optional)
- [ ] Verify token you chose
- [ ] RSVP template **Approved** (+ exact template name)
- [ ] Webhook URL verified in Meta (green check)
- [ ] Subscribed to **messages**
- [ ] Vercel Preview env vars set + redeployed
- [ ] Supabase migration run

---

## Common mistakes

| Problem | Fix |
|---------|-----|
| Only sent a 32-character hex string | That is usually **App Secret**, not the access token. Send **EAA…** token + **Phone number ID**. |
| “WhatsApp not connected” in app | Missing token or Phone number ID in Vercel, or forgot redeploy. |
| Message send fails | Template not **Approved** or wrong template **name** in Vercel. |
| Guest taps button but dashboard doesn’t update | Webhook URL not set, not subscribed to **messages**, or Preview URL doesn’t match deployed app. |

---

Questions → reply to your developer with screenshots of **API Setup** and **Message templates** pages (hide the full access token).
