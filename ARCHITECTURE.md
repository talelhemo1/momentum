# Architecture — Momentum

**עודכן:** 10 במאי 2026

מסמך זה מסביר *למה* המערכת בנויה כפי שהיא — לא רק *מה* יש בה. אם אתה חוזר לקוד אחרי 3 חודשים ושוכח החלטה — קרא את הפרק הרלוונטי כאן.

---

## 1. עקרונות מנחים

### 1.1 Offline-first
המשתמש מתכנן אירוע *פעם בחיים*. אסור שאיבוד חיבור לאינטרנט יקרע באמצע "הוספת אורח 47 מתוך 200". לכן **כל פעולה רצה מקומית קודם, מסונכרנת לענן ברקע**.

→ ראה `lib/store.ts` (localStorage primary), `lib/sync.ts` (Supabase secondary).

### 1.2 No backend code outside `app/api/`
אנחנו לא רוצים להפעיל שרת node משלנו. כל הלוגיקה היא או:
- **Client-side** (React + lib/) שרצה בדפדפן
- **Edge functions** (`app/api/*/route.ts`) שרצות ב-Vercel Edge / Serverless

→ אם פיצ'ר חדש דורש שרת מתמשך (cron, queue) — שינוי אדריכלות, לא יכניס בקלות.

### 1.3 Privacy by default
- אין tracking של משתמש אנונימי
- analytics.ts שומר רק events מקומיים, לא שולח החוצה
- AI generation לא שומר prompts/outputs
- WhatsApp links מוצפנים HMAC, לא מכילים שמות בקליר

### 1.4 RTL נכון, לא תרגום
האפליקציה לא נכתבה באנגלית ותורגמה. היא נכתבה בעברית מהשורה הראשונה. `dir="rtl"` ב-`<html>`, `direction: rtl` ב-Canvas, פונט עברי כברירת מחדל.

---

## 2. State Management

### 2.1 למה לא Redux / Zustand / Jotai
ניסיתי. כולם over-kill לאפליקציה שיש בה אובייקט state אחד גדול שנשמר ב-localStorage. בנינו store מותאם אישית:

```
lib/store.ts:
  - getStateSnapshot()  → קורא מ-localStorage או מהזיכרון
  - subscribe(cb)       → callback לכל שינוי
  - useAppState()       → React hook (useSyncExternalStore)
  - actions.X()         → mutators מפורשים
```

- **`useSyncExternalStore`** הוא ה-API הנכון ל-React 19 לסטור חיצוני. אין re-renders לא נחוצים.
- **No setState in effect** — actions קוראות `updateState()` שמטריגר את ה-subscribers. לא מעדכנים state בתוך useEffect ישירות (lint rule).

### 2.2 Multi-event "slots"
משתמש יכול לתכנן 3 חתונות בו-זמנית (לדוגמה — מתכננת אירועים). כל אירוע נשמר כ-"slot" נפרד ב-localStorage. רק אחד active בכל פעם (`cachedActiveId`).

→ `lib/eventSlots.ts`. שימוש ב-`BroadcastChannel` כדי לסנכרן בין tabs פתוחים.

### 2.3 Sync Strategy
1. כל write קורא ל-`updateState({ ... })` — מעדכן localStorage + מטריגר subscribers
2. רקע: `lib/sync.ts` שולח כל שינוי ל-Supabase (אם מוגדר)
3. `subscribeToRsvpUpdates()` מאזין לעדכונים מהענן (אורחים אחרים מאשרים בזמן אמת)
4. **קונפליקט?** — `updatedAt` מנצח. אם המקומי חדש מהענן ב-30s+, נשמר המקומי + dispatched upsert.

---

## 3. Crypto Architecture

### 3.1 RSVP Token URL
המוזמן מקבל URL כזה:
```
https://momentum.app/rsvp?e=<eventId>&g=<guestId>&t=<rsvpToken>
```

ה-`t` הוא HMAC-SHA256 חתום עם `event.signingKey` של:
```
"rsvp:<eventId>|<guestId>"
```

**למה לא JWT?** JWT דורש secret server-side. אנחנו רוצים שהמארח (client) יחתום בעצמו, כי אין לנו backend עם secrets.

**למה לא לחשוף payload ב-URL (legacy `?d=`)?**
ה-format הישן קידד את שם המארח, התאריך, וכו' ב-URL. אבל כל מי שראה לינק ב-WhatsApp ראה גם את כל הפרטים. עכשיו ה-URL מכיל רק 3 מזהים, וה-/rsvp page מבקש את הפרטים מ-Supabase לפי ה-IDs (אם המוזמן ניגש דרך הדפדפן של המארח — קורא מ-localStorage).

### 3.2 Signing Key Lifecycle
- נוצר פעם אחת ב-`mintSigningKeyAtomic` — בעת onboarding
- נשמר ב-`event.signingKey` (state)
- אסור שיועתק החוצה (לא מוצג ב-UI)
- אם המשתמש מנקה state — ה-tokens הקיימים מתבטלים (security feature)

### 3.3 AES-GCM Envelopes
`lib/envelope.ts` מצפין/מפענח payloads רגישים (כמו exports של state). שימוש ב-IV אקראי לכל envelope (לא reuse).

---

## 4. WhatsApp Integration

### 4.1 wa.me URL Pattern
```
https://wa.me/<phone>?text=<encodeURIComponent(body)>
```

**מגבלות:**
- WhatsApp לא מקבל תמונות מ-wa.me — רק טקסט
- אורך מקסימלי של body ~2000 תווים
- צריך טלפון בפורמט בינלאומי (972...)

### 4.2 OG Image Preview
פתרון התמונות: כשהמוזמן רואה את הקישור ב-WhatsApp, WhatsApp מפעיל crawler על ה-URL ושולף `<meta og:image>`. ב-`/rsvp/page.tsx` (server component) אנחנו מחזירים meta dynamically:

```ts
export async function generateMetadata({ searchParams }) {
  const img = searchParams.img;
  return {
    openGraph: { images: img ? [supabaseUrl + "/storage/v1/.../" + img] : [] }
  };
}
```

→ ככה המוזמן רואה את ההזמנה כ-preview גדול לפני שהוא מקיש על הקישור. **זה ה-magic moment הוויראלי.**

### 4.3 Phone Normalization (Single Source of Truth)
`lib/phone.ts` — היה הגיון מפוזר ב-3 מקומות שונים, כל אחד עם באגים שונים. עכשיו פונקציה אחת:
```ts
normalizeIsraeliPhone(raw): { phone: string, valid: boolean }
```

תומכת ב-`+972`, `0`, `00972`, וכו'. דוחה NaN, שורות חלקיות, ומחרוזות זדוניות.

---

## 5. AI Invitations Architecture

### 5.1 למה Replicate ולא DALL-E
| | DALL-E 3 | Flux Schnell (Replicate) |
|---|---|---|
| מחיר/תמונה | $0.04 | $0.003 (פי 13 זול) |
| איכות אסתטית | מעולה | מעולה |
| עברית | רע | רע (לא משנה — אנחנו לא מבקשים טקסט) |
| API | OpenAI SDK | HTTP + Bearer |

→ Flux Schnell. עלות חודשית לפרימיום עם quota 20: **$0.06/לקוח**.

### 5.2 Hebrew Text in Canvas
**אף מודל לא מצייר עברית טוב.** הם מייצרים אותיות שנראות כמו עברית אבל הן ג'יבריש.

הפתרון: AI מייצר רקע (`prompt` תמיד מסתיים ב-`NO TEXT, NO LETTERS`). הדפדפן מצייר את הטקסט בעברית עם:
```ts
ctx.direction = "rtl";
ctx.textAlign = "center";
ctx.fillText(subjects, x, y);
```

זה נותן לנו טיפוגרפיה עברית מושלמת חינם. רנדור ב-Canvas, העלאה ל-Supabase Storage כ-PNG.

### 5.3 Premium Gating
**Server-side validation, לא רק UI.** ה-API endpoint `/api/invitation/generate` בודק:
1. JWT תקף (Supabase auth)
2. `profiles.subscription_tier === "premium"` (או env demo flag)
3. Quota: pacing — 20 generations/חודש ספק קלנדרי

→ אם המשתמש פותח DevTools ומסיר את ה-`isPremium` check ב-UI, הוא עדיין יקבל 402 מהשרת.

---

## 6. Vendor Marketplace

### 6.1 Two-stage onboarding (Phase 0)
**Phase 0 (current):** ספק מגיש בקשה → אדמין מאשר ידנית → ספק נכנס לקטלוג.
**Phase 1 (post-launch):** ספק מאושר מקבל login → ניהול עצמי של פרופיל.
**Phase 2 (month 3+):** Stripe + paid placement מלא + reviews.

→ הסיבה לשלב ידני: **safety net משפטית**. ספק לא לגיטימי לא נכנס לקטלוג. אחרי שיש לי זרם של 50+ ספקים בשבוע — אעבור ל-self-service.

### 6.2 RLS Policies
```sql
-- כל אחד יכול לשלוח בקשה (אם status='pending')
create policy "public can submit applications" on vendor_applications
  for insert with check (
    status = 'pending' and approved_vendor_id is null and ...
  );

-- רק admin רואה
create policy "admin reads applications" on vendor_applications
  for select using (auth.jwt() ->> 'email' in (select email from admin_emails));
```

→ הקריטי: ה-`with check` של ה-INSERT דוחה אם הספק מנסה לשלוח `status='approved'` ידנית. בלי זה, ספק יכול לאשר את עצמו.

### 6.3 Race Protection
שני אדמינים לוחצים "אשר" בו-זמנית — שני INSERTs ל-vendors. הפתרון:
```ts
.update(updates)
.eq("id", applicationId)
.eq("status", "pending")  // race protection
.select("id");

if (!updated || updated.length === 0) {
  return 409 "כבר אושר/נדחה";
}
```

---

## 7. Origin Handling

### 7.1 The Bug We Avoided
Pre-fix: כל קובץ עשה `const origin = typeof window !== "undefined" ? window.location.origin : ""`. כשרץ ב-SSR, origin היה `""`. אז `${origin}/rsvp?...` היה `/rsvp?...` (URL יחסי). ה-cache של `useGuestWhatsappLink` תפס את הערך הריק → כל ההזמנות יצאו עם URL שבור.

### 7.2 The Fix (`lib/origin.ts`)
פונקציה אחת שמחזירה origin תקף:
1. `NEXT_PUBLIC_SITE_URL` (env) — תמיד מנצח, חייב ב-production
2. `window.location.origin` — fallback לרינדור client בדפדפן
3. **זורק** אם שניהם לא זמינים — אסור לשלוח URL ריק

→ כל מקום בקוד שצריך origin משתמש ב-`getPublicOrigin()` או `tryGetPublicOrigin()`. אין יותר חישוב inline.

---

## 8. Hebrew RTL Strategy

### 8.1 לא רק `dir="rtl"`
- `<html lang="he" dir="rtl">` ב-`app/layout.tsx`
- Tailwind utilities: `text-start` / `text-end` במקום `text-left` / `text-right`
- Spacing: `ms-` / `me-` (margin-start/end) במקום `ml-` / `mr-`
- Numbers: `<span className="ltr-num">` (CSS `direction: ltr`) — מספרים תמיד LTR גם בעברית

### 8.2 Bidi gotchas
טקסט מעורב (עברית + אנגלית) דורש זהירות. דוגמאות שטיפלנו:
- "5 מתוך 5 שלבים" — `5` + `מתוך 5 שלבים` יוצרים bidi mess אם לא עוטפים את המספרים ב-`ltr-num`
- ה-`ResponseSentCard` — קישור URL בעברית, צריך לעטוף את ה-URL ב-`<bdi>` או `direction: ltr`

### 8.3 Canvas RTL
- `ctx.direction = "rtl"` חובה לפני `fillText` עם עברית
- `textAlign = "center"` עם RTL = מרכז אוטומטי, אין צורך ב-X תיקון
- Fonts: `Heebo`, `Assistant`, `Arial Hebrew` — בסדר הזה

---

## 9. Performance

### 9.1 Cached Link Builder
`hooks/useGuestWhatsappLink.ts` — bottleneck היה: 200 guest cards = 200 HMAC computations במקביל = 1.5s freeze. הפתרון:
- **Module-scoped Promise cache** — אותו `eventId:guestId:token` משתמש פעם אחת
- **Microtask defer** — `queueMicrotask(() => buildLink(...))` נותן לרינדור להסתיים קודם

### 9.2 Smart Arrangement Animation
זיהינו ב-R3 שעיכוב מלאכותי של 1600ms הסתיר ש-smartArrangement רץ ב-<50ms. עכשיו:
- 450ms scan animation (UI)
- חישוב אמיתי בו-זמנית
- Stagger of 80ms בין הקצאה להקצאה (UI)

→ סך הכל ~1.2s אבל זה מציג משהו אמיתי, לא רק מסך טעינה.

### 9.3 Skeletons + loading.tsx
כל עמוד מרכזי מקבל `loading.tsx` עם skeleton מתאים. Next.js מציג אוטומטית בזמן navigation. אין יותר "flash of empty layout".

---

## 10. Decisions We Reversed

### 10.1 Israeli Calendar (DISABLED 10/5/2026)
היה: זיהוי שבת/חגים יהודיים → חסימת התראות בשבת.
ביטלנו: היה מורכב לתחזוקה, יצר באגים, לא מכריע ל-launch.
המצב: `lib/israeliCalendar.ts` שומר את ה-stubs (כל הפונקציות מחזירות "לא שבת, לא חג"). להחזיר — restore מ-git.

### 10.2 IntersectionObserver Gate ל-link building
היה: בנו links רק כשהכרטיס נראה (lazy). יצר בעיות StrictMode + scroll containers שגרמו ל-"WhatsApp doesn't work".
ביטלנו: עכשיו בונים מיד עם microtask defer. הביצועים סבירים.

### 10.3 לא הוספנו React Query / SWR
שקלנו אבל החלטנו: ה-data שלנו רוב הזמן מקומי (localStorage). React Query יוסיף 12KB לחבילה ולא יעזור.

---

## 11. What's Missing (Tech Debt)

- **Error monitoring (Sentry/LogRocket)** — אין. כשמשהו ייפול ב-production נדע רק מתלונות משתמשים.
- **E2E tests** — אין. אנחנו מסתמכים על TypeScript + lint + manual testing.
- **Stripe integration** — Phase 2. כרגע ספקים בוחרים tier אבל לא משלמים בפועל.
- **Vendor catalog table ב-Supabase** — היום הקטלוג סטטי ב-`lib/vendors.ts`. ספק שמאושר לא מופיע אוטומטית — דורש סנכרון ידני.
- **Push notifications (Web Push API)** — Notifications API קיים אבל push לא מוטמע.

---

## 12. Reading List

לפני שינויים מהותיים — קרא את הקובץ הרלוונטי:
- `lib/store.ts` — לפני שינוי ל-state structure
- `lib/crypto.ts` + `lib/rsvpLinks.ts` — לפני שינוי לזרימת RSVP
- `lib/origin.ts` — לפני שינוי לבניית URL
- `app/api/vendors/admin/decide/route.ts` — לפני שינוי לזרימת admin
- `next.config.ts` — לפני הוספת domain ל-CSP
