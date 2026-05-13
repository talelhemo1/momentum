# Setup From Scratch — Momentum

**עודכן:** 10 במאי 2026

מדריך הקמה מאפס לסביבת פיתוח. למישהו שמקבל את הקוד בפעם הראשונה (אתה אחרי 3 חודשים, או מפתח חיצוני).

זמן צפוי: **30-45 דקות**.

---

## דרישות מקדימות

| כלי | גרסה מינימלית | התקנה |
|---|---|---|
| Node.js | 20.0+ | https://nodejs.org או `nvm install 20` |
| npm | 10.0+ | מגיע עם Node |
| Git | 2.30+ | מגיע עם macOS |
| VS Code (מומלץ) | אחרון | https://code.visualstudio.com |
| (אופציונלי) cloudflared | אחרון | `brew install cloudflared` — לטסטים מ-WhatsApp |
| (אופציונלי) Supabase CLI | אחרון | `brew install supabase/tap/supabase` |

---

## שלב 1 — קבלת הקוד

### אם זה repo קיים ב-Git
```bash
cd ~/פרויקט\ ראשון
git clone <repo-url> momentum
cd momentum
```

### אם יש לך גיבוי tar.gz
```bash
cd ~/פרויקט\ ראשון
tar -xzf ~/Desktop/Momentum-מסמכים/04-גיבויים/גיבוי-XXXX.tar.gz -C momentum
cd momentum
```

### אם זה מכלום
לא רלוונטי — צריך לקבל את הקוד.

---

## שלב 2 — Install Dependencies

```bash
npm install
```

זה ייקח 2-3 דקות בפעם הראשונה. תראה ~600 packages, אזהרות נורמליות.

**אם יש שגיאות:**
- `EACCES` — הרץ עם `sudo` או תקן permissions של node_modules
- `peer dependency conflict` — `npm install --legacy-peer-deps`
- `node version too old` — `nvm install 20 && nvm use 20`

---

## שלב 3 — Environment Variables

```bash
cp .env.example .env.local
```

עכשיו ערוך `.env.local` ב-VS Code:

```bash
code .env.local
```

### ערכים הכרחיים לפיתוח

```
# ה-origin הציבורי — לטסטים מקומיים השאר כלוקאל-הוסט
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Demo mode — מאפשר AI features בלי Supabase profile
NEXT_PUBLIC_AI_DEMO_MODE=true
```

### ערכים אופציונליים (לפי מה שאתה רוצה לבדוק)

#### Supabase (לטסטים של auth + sync + vendor onboarding)
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...(מחרוזת ארוכה)
```
איך לקבל: ראה `DEPLOYMENT.md` שלב 1.

#### Replicate (ל-AI invitations)
```
REPLICATE_API_TOKEN=r8_...
```
איך לקבל: ראה `DEPLOYMENT.md` שלב 3.

#### Notifications (ל-vendor onboarding alerts)
```
RESEND_API_KEY=re_...
CALLMEBOT_PHONE=972501234567
CALLMEBOT_API_KEY=...
```
איך לקבל: ראה `DEPLOYMENT.md` שלב 4.

---

## שלב 4 — Supabase Migrations (אם משתמשים ב-Supabase)

ב-Supabase dashboard → SQL Editor, הריץ בסדר:

1. `supabase/schema.sql`
2. `supabase/migrations/2026-05-10-invitations.sql`
3. `supabase/migrations/2026-05-10-vendor-applications.sql`
4. הוסף RLS policy ל-admin_emails:
```sql
create policy "user can read own admin row" on admin_emails
  for select using (auth.jwt() ->> 'email' = email);
```

---

## שלב 5 — Verification

```bash
# בדוק שאין שגיאות TypeScript
npx tsc --noEmit

# בדוק לינט
npm run lint

# וודא שהbuild עובר
npm run build
```

3 הצעדים האלה חייבים להחזיר 0 שגיאות. אם לא — משהו בהתקנה השתבש.

---

## שלב 6 — הפעלה

### למצב dev רגיל (localhost:3000)
```bash
npm run dev
```

פתח http://localhost:3000

### למצב dev עם URL ציבורי (ל-WhatsApp testing)
```bash
npm run dev:public
```

זה יפעיל cloudflared tunnel ויעדכן `NEXT_PUBLIC_SITE_URL` אוטומטית. תראה URL כמו `https://abc-xyz.trycloudflare.com`. כל קישור WhatsApp שייצא יכלול את ה-URL הציבורי.

⚠️ דורש cloudflared מותקן: `brew install cloudflared`.

---

## שלב 7 — VS Code Extensions מומלצות

- **ES Lint** (Microsoft) — מסמן שגיאות בזמן אמת
- **Prettier** — formatter
- **Tailwind CSS IntelliSense** — auto-complete לטיילווינד
- **TypeScript Hero** — auto-import
- **Hebrew Language Pack** — UI בעברית
- **Better Comments** — קומנטים צבעוניים לפי TODO/FIXME/!

---

## מבנה הקוד — איפה מה

ראה `ARCHITECTURE.md` לפירוט מלא. מהיר:

| תיקייה | מטרה |
|---|---|
| `app/` | דפים + API routes (Next.js App Router) |
| `app/api/` | server endpoints |
| `components/` | רכיבי UI משותפים |
| `lib/` | לוגיקה: store, crypto, sync, integrations |
| `hooks/` | React hooks |
| `supabase/` | DB schema + migrations |
| `scripts/` | shell utilities |

---

## פעולות נפוצות

### הוסף עמוד חדש
```bash
mkdir app/my-feature
```
צור `app/my-feature/page.tsx`. אם צריך client-side — `"use client";` בראש.

### הוסף API endpoint
```bash
mkdir -p app/api/my-feature
```
צור `app/api/my-feature/route.ts` עם `export async function POST(req) { ... }`.

### הוסף state חדש לסטור
1. הוסף שדה ל-`AppState` ב-`lib/types.ts`
2. הוסף ל-`DEFAULT_STATE` ב-`lib/store.ts`
3. הוסף migration אם state ישן יש לו את השדה החסר
4. הוסף `actions.X()` ב-`lib/store.ts`
5. השתמש ב-`useAppState()` ברכיב

### הוסף Supabase migration
```bash
touch supabase/migrations/YYYY-MM-DD-feature-name.sql
```
כתוב את ה-SQL → הריץ ב-Supabase dashboard → commit.

### עדכן את הסטיילים
- Tailwind utilities — תוסף ל-className
- CSS variables — ערוך `app/globals.css` (יש שם design tokens)
- חדש — תוסף לסוף `globals.css`

---

## בעיות נפוצות

### "Module not found"
```bash
rm -rf node_modules .next
npm install
```

### "Hydration mismatch"
- חפש קוד שמשתמש ב-`Date.now()` או `Math.random()` ב-render
- וודא ש-`typeof window !== "undefined"` עוטף גישה ל-window

### "TypeScript error after pulling"
```bash
rm tsconfig.tsbuildinfo
npx tsc --noEmit
```

### "Supabase connection refused"
- בדוק `NEXT_PUBLIC_SUPABASE_URL` נכון בלי trailing slash
- בדוק ש-RLS policies מאפשרות את הפעולה
- בדוק `next.config.ts` CSP `connect-src` כולל `https://*.supabase.co`

### "Cloudflared keeps restarting"
- אל תפתח 2 פעמים את `npm run dev:public` — רק אחד ירוץ
- אם תקוע — `pkill cloudflared` ואז שוב

---

## פעם ראשונה? קרא את אלה

לפי הסדר:
1. **`README.md`** — סקירה כללית קצרה
2. **`PROJECT_OVERVIEW.md`** — מה האפליקציה עושה
3. **`ARCHITECTURE.md`** — איך היא בנויה
4. **`SECURITY.md`** — מנגנוני אבטחה
5. **`DEPLOYMENT.md`** — איך לעלות לאוויר
6. **`OPERATIONS.md`** — איך לתחזק

---

## איפה לקבל עזרה

- **בעיות בקוד** — Issues ב-GitHub repo
- **שאלות על Next.js 16** — https://nextjs.org/docs
- **שאלות על Supabase** — https://supabase.com/docs
- **באגים בשרת תפס** — `vercel logs` או Vercel dashboard
