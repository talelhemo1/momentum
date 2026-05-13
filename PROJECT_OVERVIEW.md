# Momentum — Project Overview

**עודכן:** 10 במאי 2026
**גרסה:** 0.1.0 (pre-launch)

> Hebrew RTL PWA לתכנון אירועים — חתונות, חינות, בר/בת מצווה, ועוד. בנוי כ-marketplace דו-צדדי: לקוחות (זוגות/מארחים) משלמים עבור כלי תכנון פרימיום, ספקים משלמים עבור placement מועדף בקטלוג.

---

## 🏗️ Stack טכני

| שכבה | טכנולוגיה |
|---|---|
| Framework | Next.js 16.2.5 (App Router) |
| UI | React 19.2.4 + TypeScript strict |
| Styling | Tailwind CSS v4 + CSS variables design tokens |
| Animation | Framer Motion 12.38 |
| State | Custom store ב-`lib/store.ts` (`useSyncExternalStore`) + localStorage |
| Auth + DB | Supabase (`@supabase/supabase-js` 2.105) — opt-in דרך env vars |
| Crypto | Web Crypto API native (HMAC-SHA256, AES-GCM, HKDF) |
| AI | Replicate Flux Schnell (לרקעים בלבד — טקסט עברי ב-Canvas client-side) |
| Notifications | Resend (email) + CallMeBot (WhatsApp) — opt-in |
| Tunnel for dev | cloudflared (`npm run dev:public`) |
| QR codes | `qrcode` 1.5 |
| Icons | lucide-react 1.14 |

---

## 📁 מבנה תיקיות

```
momentum/
├── app/                    Next.js App Router pages + API routes
│   ├── api/               Server route handlers
│   │   ├── invitation/    AI invitation generate + save
│   │   └── vendors/       Vendor application submit + admin decide
│   ├── admin/vendors/     לוח בקרה לאישור ספקים (admin only)
│   ├── alcohol/           מחשבון אלכוהול ומשקאות
│   ├── auth/              OAuth callbacks
│   ├── balance/           ניהול תקציב
│   ├── budget/            תכנון תקציב מראש
│   ├── checklist/         צ'קליסט משימות לפי שלב באירוע
│   ├── compare/           השוואת ספקים
│   ├── dashboard/         דשבורד ראשי (אחרי onboarding)
│   ├── event-day/         מצב יום-האירוע (live tracking)
│   ├── guests/            ניהול אורחים, שליחת הזמנות, RSVP tracking
│   ├── inbox/             קבלת RSVPs מ-WhatsApp links
│   ├── invitation/        עיצוב הזמנות AI (premium)
│   ├── live/[eventId]/    דף ציבורי — מסך גדול ביום האירוע
│   ├── onboarding/        ויזרד להגדרת אירוע
│   ├── pricing/           עמוד מסלולי premium לזוגות
│   ├── privacy/           Privacy Policy ציבורי
│   ├── rsvp/              דף RSVP פומבי שאורח רואה (server + client)
│   ├── seating/           סידור הושבה — drag-drop + smart arrangement
│   ├── settings/          הגדרות משתמש + ייצוא/ייבוא נתונים
│   ├── signup/            הרשמת משתמש חדש
│   ├── start/             מסך כניסה דו-מסלולי (זוג / ספק)
│   ├── terms/             ToS ציבורי
│   ├── timeline/          ציר זמן של האירוע
│   ├── vendors/           קטלוג ספקים + הוספה לרשימה אישית
│   │   ├── join/          טופס הצטרפות לפלטפורמה (לספקים)
│   │   ├── my/            "הספקים שלי" — ניהול סוכמים, פגישות, מחירים
│   │   └── welcome/       3 מסלולי תמחור לספקים
│   └── layout.tsx         Root layout — html lang="he" dir="rtl"
│
├── components/            רכיבי UI משותפים
├── lib/                   לוגיקה משותפת (store, crypto, sync, ספריות פיצ'רים)
├── hooks/                 React hooks
├── supabase/              schema.sql + migrations/
├── scripts/               cloudflared dev tunnel
└── .github/workflows/     CI: lint + tsc + audit + build
```

---

## ✨ פיצ'רים עיקריים

### לזוגות / מארחים
- **Onboarding wizard** — סוג אירוע, תאריך, פרטי מארחים, מקום
- **ניהול אורחים** — הוספה, ייבוא CSV, סטטוסים, סינון
- **שליחת הזמנות בוואצאפ** — token URL חתום HMAC, מניעת זיוף
- **RSVP tracking בזמן אמת** — מסך מסונכרן בין מכשירים
- **סידור הושבה (drag-drop)** — סידור חכם אוטומטי + עריכה ידנית
- **קטלוג ספקים** — חיפוש, סינון, השוואה, "הוסף לרשימה שלי"
- **CRM ספקים אישי** — מחיר סוכם, מקדמה, פגישה, סטטוס, דירוג
- **תקציב + מאזן** — סיכום הוצאות, צפי
- **מחשבון אלכוהול** — חישוב כמויות לפי אורחים/משך/קהל
- **Live event mode** — מסך ציבורי ליום האירוע
- **AI invitations (Premium)** — עיצוב רקע ב-Replicate + טקסט עברי ב-Canvas

### לספקים
- **טופס הצטרפות** עם 3 שאלות אימות (ת.ז., שנים בתחום, דוגמה)
- **3 מסלולי מנוי** — חינם / רגיל (199₪) / פרימיום (499₪)
- **אישור ידני שלי לפני שנכנסים לקטלוג**

### ל-admin (אני)
- **לוח בקרת ספקים** ב-`/admin/vendors`
- **התראות מייל + WhatsApp** על כל בקשה חדשה
- **Approve / Reject** עם סיבת דחייה (נשלחת לספק)

---

## 🔐 אבטחה

ראה `SECURITY.md` לפירוט מלא. בקצרה:
- **CSP מחמיר** — `default-src 'self'`, אין `eval` בפרודקשן
- **HMAC-SHA256** — חתימה על RSVP tokens
- **AES-GCM** — הצפנת payload רגיש
- **HKDF** — נגזרת מפתחות
- **RLS** — Supabase Row Level Security
- **Origin validation** — `lib/origin.ts` חוסם URLs יחסיים
- **URL whitelist** — רק `https://` ב-vendor links

---

## 🌐 דרישות סביבה

ראה `.env.example` לרשימה מלאה. הכרחי ל-production:
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `REPLICATE_API_TOKEN` (אם רוצים AI invitations)
- `RESEND_API_KEY` (אם רוצים התראות מייל)
- `CALLMEBOT_PHONE` + `CALLMEBOT_API_KEY` (אם רוצים התראות WhatsApp)

---

## 📊 מצב עכשיו (10/5/2026)

| מדד | ערך |
|---|---|
| Lint errors | **0** ✅ |
| TypeScript errors | **0** ✅ |
| Open security vulnerabilities | **0** ✅ |
| מסכים | 25+ |
| ספקים בקטלוג סטטי | 284 |
| Bug rounds completed | R1 → R6 (62+ באגים תוקנו) |
| Days to launch | 15 |

---

## 🚀 לקראת launch

ראה `DEPLOYMENT.md` ו-`OPERATIONS.md`.

---

## 🧠 החלטות ארכיטקטוניות

ראה `ARCHITECTURE.md` לפירוט מלא.

עיקריות:
- **localStorage as primary, Supabase as sync layer** — המשתמש יכול לעבוד offline
- **HMAC tokens במקום payload-in-URL** — לא חושף PII בקישורי WhatsApp
- **AI לרקעים בלבד, טקסט בעברית ב-Canvas** — אף מודל לא מצייר עברית טוב
- **Premium gating server-side** — לא רק UI, גם API מאמת
- **Hebrew RTL native** — `lang="he" dir="rtl"` ב-root, `direction: rtl` ב-Canvas
