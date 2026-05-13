# Deployment Guide — Momentum

**עודכן:** 10 במאי 2026

מדריך מסודר ל-deploy של Momentum לפרודקשן. מומלץ לעקוב בסדר. הזמן הצפוי בפעם הראשונה: **45-90 דקות**.

---

## תרשים זרימה

```
1. הכן Supabase project
   ↓
2. הרץ SQL migrations
   ↓
3. הכן Replicate token (אופציונלי, ל-AI invitations)
   ↓
4. הכן Resend + CallMeBot tokens (אופציונלי, להתראות)
   ↓
5. רכוש domain (אופציונלי בהתחלה)
   ↓
6. Deploy ל-Vercel
   ↓
7. הגדר env vars ב-Vercel
   ↓
8. בדיקה end-to-end
   ↓
9. (אם יש domain) חבר ל-Vercel + DNS
```

---

## שלב 1 — Supabase Project

### 1.1 צור פרויקט
1. לך ל-https://supabase.com → התחבר עם GitHub
2. **New project**
3. שם: `momentum-production`
4. **Database password**: צור סיסמה חזקה ושמור ב-1Password (או הכלי שלך)
5. **Region**: `Frankfurt (eu-central-1)` — הכי קרוב לישראל
6. Plan: Free (מספיק עד 500MB DB / 1GB Storage / 50K MAU)
7. צור — ייקח 2 דקות

### 1.2 קח את המפתחות
מהפרויקט שיצרת:
- **Settings → API**
- העתק את:
  - `Project URL` (נראה כמו `https://abcdef.supabase.co`)
  - `Project API keys → anon public` (JWT ארוך, ~250+ תווים)

שמור את אלה — תשתמש בהם בשלב 7.

### 1.3 הגדר Auth providers (אופציונלי)
- **Authentication → Providers**
- אפשר לפי הצורך: Google / Apple / Phone (Twilio) / Email
- **Authentication → URL Configuration**:
  - Site URL: `https://your-domain.com` (או הזמני של Vercel)
  - Redirect URLs: הוסף את כל הדומיינים (production + preview + localhost)

---

## שלב 2 — SQL Migrations

ב-Supabase dashboard → **SQL Editor** → New query.

הרץ **בסדר הזה** (כל אחד בנפרד, וודא שאין שגיאות לפני המעבר הבא):

### 2.1 Schema ראשי
1. פתח `supabase/schema.sql` בעורך
2. העתק תוכן
3. הדבק ב-SQL Editor ב-Supabase
4. Run
5. וודא שכל הטבלאות נוצרו: events, guests, vendors, profiles וכו'

### 2.2 AI Invitations migration
1. פתח `supabase/migrations/2026-05-10-invitations.sql`
2. העתק והרץ
3. וודא: טבלה `ai_generations` קיימת + שדות `invitation_image_url, invitation_style, invitation_overlay_data` ב-events
4. וודא: bucket `invitations` קיים תחת **Storage**

### 2.3 Vendor Applications migration
1. פתח `supabase/migrations/2026-05-10-vendor-applications.sql`
2. העתק והרץ
3. וודא: טבלאות `vendor_applications`, `admin_emails`, `vendor_notifications_log` קיימות
4. וודא: שורה ב-`admin_emails` עם המייל שלך
5. **חשוב — תוסיף RLS שלא נכלל באוטומטי**:
```sql
create policy "user can read own admin row" on admin_emails
  for select using (auth.jwt() ->> 'email' = email);
```

### 2.4 Vendor Tier migration
```sql
alter table vendor_applications
  add column if not exists tier text default 'free' check (tier in ('free', 'standard', 'premium')),
  add column if not exists payment_status text default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'failed'));
```

---

## שלב 3 — Replicate (אופציונלי, ל-AI Invitations)

אם אתה לא משתמש ב-AI invitations — דלג.

1. https://replicate.com → התחבר עם GitHub
2. **Account → API tokens → Create token**
3. שם: `momentum-production`
4. העתק את ה-token (מתחיל ב-`r8_...`)
5. שמור — תשתמש בשלב 7

עלות צפויה: $0.003/תמונה. עם quota 20/לקוח/חודש = ~$0.06/לקוח/חודש.

---

## שלב 4 — Notifications (אופציונלי)

### 4.1 Resend (email)
1. https://resend.com → הירשם
2. **API Keys → Create API Key**
3. שם: `momentum-prod`
4. Permission: `Sending access`
5. שמור — תשתמש בשלב 7

Free tier: 3000 מיילים/חודש. מספיק לאלפי בקשות ספקים.

### 4.2 CallMeBot (WhatsApp)
1. שלח `I allow callmebot to send me messages` למספר `+34 644 51 95 23` בוואצאפ שלך
2. תקבל מייל עם API key
3. שמור: ה-`CALLMEBOT_PHONE` הוא הטלפון שלך (פורמט `972501234567`), ה-`CALLMEBOT_API_KEY` הוא מהמייל

חינם לחלוטין לשימוש אישי.

---

## שלב 5 — Domain (אופציונלי בהתחלה)

אפשר לדחות ולקבל בהתחלה את הדומיין הזמני של Vercel (`momentum-tal.vercel.app`).

כשתרצה domain אמיתי:
1. רכוש domain (Cloudflare Registrar הכי זול = $9-15/שנה)
2. ב-Cloudflare DNS:
   - Type: CNAME, Name: `@`, Target: `cname.vercel-dns.com`, Proxy: OFF
   - Type: CNAME, Name: `www`, Target: `cname.vercel-dns.com`, Proxy: OFF
3. ב-Vercel (אחרי שלב 6) → Settings → Domains → Add → הזן את הדומיין

---

## שלב 6 — Deploy ל-Vercel

### 6.1 התקן Vercel CLI (פעם אחת)
```bash
npm install -g vercel
```

### 6.2 הריץ
```bash
cd ~/פרויקט\ ראשון/momentum
vercel
```

יישאל אותך:
- **Set up and deploy?** → Y
- **Which scope?** → בחר את החשבון שלך
- **Link to existing project?** → N
- **Project name?** → `momentum` (או מה שתרצה)
- **Directory?** → `./` (Enter)
- **Auto-detect settings?** → Y

יבנה ויעלה. תקבל URL זמני כמו `https://momentum-tal.vercel.app`.

### 6.3 Production deploy
```bash
vercel --prod
```

עכשיו ה-URL הוא הראשי (לא preview).

---

## שלב 7 — הגדר Environment Variables ב-Vercel

ב-Vercel dashboard → Project → **Settings → Environment Variables**.

הוסף את הבאים (Production environment):

| Key | Value | חובה? |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | ✅ חובה |
| `NEXT_PUBLIC_SUPABASE_URL` | מ-2.2 | ✅ חובה |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מ-2.2 | ✅ חובה |
| `REPLICATE_API_TOKEN` | מ-3 | אופציונלי (ל-AI) |
| `RESEND_API_KEY` | מ-4.1 | אופציונלי (להתראות) |
| `CALLMEBOT_PHONE` | מ-4.2 | אופציונלי |
| `CALLMEBOT_API_KEY` | מ-4.2 | אופציונלי |
| `ADMIN_EMAIL` | המייל שלך | אופציונלי (default: talhemo132@gmail.com) |

**אחרי הוספת כל env vars** — Redeploy:
```bash
vercel --prod --force
```

(הכרחי — Next.js בונה env בזמן build, לא runtime.)

---

## שלב 8 — בדיקה End-to-End

מהנייד שלך:

### 8.1 קליינט (זוג)
1. פתח `https://your-domain.com`
2. הירשם / התחבר
3. עבור onboarding — צור אירוע
4. הוסף 2 אורחים עם הטלפון שלך + של חבר
5. שלח הזמנה לחבר ב-WhatsApp
6. וודא שהקישור שהוא קיבל פותח את `/rsvp` עם פרטי האירוע
7. החבר מאשר — וודא שאתה רואה את האישור על הדשבורד שלך

### 8.2 ספק
1. גלישה פרטית, פתח `https://your-domain.com`
2. בחר "ספק או בעל עסק"
3. בחר מסלול → מלא את הטופס → שלח
4. וודא שאתה (admin) קיבלת מייל + WhatsApp עם פרטי הבקשה
5. לך ל-`/admin/vendors` (התחבר עם המייל שב-`admin_emails`)
6. אשר את הספק
7. וודא שהוא נכנס לקטלוג

### 8.3 AI Invitation (אם הפעלת)
1. בדף `/invitation` (כמשתמש premium — תפעיל via `localStorage.setItem("momentum:premium_demo", "true")` או via Supabase profile)
2. בחר סטייל → צור
3. וודא שהתמונה נטענת
4. שמור → וודא שהיא נכנסת לאירוע

---

## שלב 9 — אם יש Domain

ב-Vercel → Project → Settings → Domains → Add → הזן `your-domain.com`.

Vercel יבקש להוסיף DNS records. אם השתמשת ב-Cloudflare (שלב 5) — זה כבר שם.

המתן 5-30 דקות ל-propagation. בדוק עם:
```bash
dig your-domain.com
```

אחרי שעובד — **עדכן את `NEXT_PUBLIC_SITE_URL`** ב-Vercel ל-`https://your-domain.com` ו-redeploy.

---

## רשימת checklist סופית לפני launch

- [ ] Supabase: כל המיגרציות הורצו ללא שגיאה
- [ ] Supabase: הוספת `user can read own admin row` policy
- [ ] Supabase: שורה ב-`admin_emails` עם המייל שלך
- [ ] Vercel: כל ה-env vars מוגדרים ב-Production
- [ ] Vercel: deploy אחרון --force אחרי env vars
- [ ] בדיקה end-to-end קליינט מהנייד
- [ ] בדיקה end-to-end ספק מהנייד
- [ ] קיבלת באמת מייל + WhatsApp על בקשה חדשה
- [ ] DNS מצביע נכון (אם יש domain)
- [ ] הקפד `tsconfig.tsbuildinfo` לא ב-git (ב-.gitignore כבר)
- [ ] commit + push לפני launch (אסור ש-87 קבצים יושבים לוקאלית)
- [ ] תקנון + privacy policy ציבוריים בעברית (`/terms` `/privacy`)
- [ ] לפחות גיבוי אחד טרי ב-`Momentum-מסמכים/04-גיבויים/`

---

## בעיות נפוצות

### "WhatsApp link doesn't open" אצל מוזמן
- וודא ש-`NEXT_PUBLIC_SITE_URL` מוגדר ב-Vercel **ו-redeploy** אחרי
- בדוק שה-URL בקישור מתחיל ב-`https://` (לא `/rsvp?...`)

### "Cannot reach Supabase"
- בדוק CSP ב-`next.config.ts` — `connect-src` חייב לכלול `https://*.supabase.co`
- בדוק ש-`NEXT_PUBLIC_SUPABASE_URL` נכון בלי trailing slash

### "Admin sees empty applications list"
- ה-RLS policy `user can read own admin row` חסר. הריץ את ה-SQL מ-2.3.
- וודא ש-`auth.jwt() ->> 'email'` מחזיר את המייל שלך — בדוק עם:
```sql
select auth.jwt() ->> 'email';
```

### "Email notification not received"
- בדוק `RESEND_API_KEY` ב-Vercel
- ב-Resend dashboard → Logs → תראה מיילים שניסה לשלוח + שגיאות
- בדוק ספאם

### Vercel build fails
- בדוק ש-`tsconfig.json` תואם ל-Next 16 (`"moduleResolution": "bundler"`)
- וודא ש-`NEXT_PUBLIC_*` env vars מוגדרים *לפני* ה-build (Vercel UI)

---

## העברה בין סביבות

ה-codebase תומך ב-3 סביבות:
- **Local**: `.env.local` עם cloudflared tunnel (`npm run dev:public`)
- **Preview** (Vercel branch deploys): env vars מוגדרים ב-Vercel → Preview environment
- **Production**: env vars ב-Production environment

לקבל URL preview יציב בלי merge: push branch → Vercel ייצור URL אוטומטית.
