This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Momentum Live setup

Momentum Live lets a couple delegate event-day operations to a trusted
manager via a single-use accept link, delivered over **two channels**
(WhatsApp + SMS) so it arrives even if one fails.

### Required env

- **`NEXT_PUBLIC_SITE_URL`** — **required.** The public origin (e.g.
  `https://momentum-psi-ten.vercel.app`). Without it the accept link in
  the invite falls back to a relative path and won't open from WhatsApp
  on the manager's phone.

### Optional env (SMS backup — degrades gracefully)

The WhatsApp channel always works (it's a `wa.me` deep link the couple
opens). The SMS backup is best-effort: if these are unset the invite
still works, the SMS is just skipped.

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM` — optional, defaults to `+972533625007`

### Supabase migrations (run both in the SQL editor)

1. `supabase/migrations/2026-05-10-event-day-manager.sql` — the
   `event_managers` table + RLS.
2. `supabase/migrations/2026-05-12-accept-manager-rpc.sql` — the
   accept-invitation RPC.

Without these the manager invite insert fails (the setup screen shows a
pointer to `/manage/diagnose`).

### Tests

```bash
npm run test -- managerInvitation
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
