# Changelog — Momentum

כל השינויים המשמעותיים בפרויקט. פורמט: [Keep a Changelog](https://keepachangelog.com/he/1.1.0/).

---

## [R29] — 2026-05-17 — Hotfix: עמידות /i/[token] לשורת short_links חסרה

תיקון: כשל Supabase / שורה חסרה גרם לדף קריסה גנרי במקום מסך "ההזמנה פגה תוקף".
עכשיו `generateMetadata` (עם `.catch`), `lookupShortLink`, `createShortLink`
ו-`lookupEventByToken` עטופים כולם ב-try/catch — אפס שגיאות יוצאות מנתיב
ה-OG/שרת, וזרם ההזמנה נופל בחן לקישור הארוך. ללא שינוי סכימה/התנהגות בנתיב התקין.
tsc + lint (0 errors) + build (46) ירוקים.

---

## [R28] — 2026-05-17 — הזמנת WhatsApp יוקרתית (OG image + קישור מקוצר)

כל קישור הזמנה מציג עכשיו תצוגה מקדימה יוקרתית ב-WhatsApp במקום URL ארוך ומכוער. 46 ראוטים, כל הבדיקות ירוקות.

### ⚠️ דרושה הרצת מיגרציה לפני deploy
`supabase/migrations/2026-05-17-short-links.sql` (טבלת `short_links`). בלי זה — נפילה חיננית לקישור המלא (כלום לא נשבר).

### תמונת OG דינמית
`/i/[token]/opengraph-image` — כרטיס הזמנה זהוב (לוגו, סוג אירוע, שמות המארחים ענקיים, תאריך, מקום, CTA), עם פונט עברי (Heebo) מוטמע. fallback מעוצב אם הקישור לא נמצא. Cache 24ש׳ ב-CDN.

### קישור מקוצר
`/i/<6 תווים>` (base56, ~30 מיליארד צירופים) → redirect שרת ל-`/rsvp` האמיתי. נתוני האירוע נשלפים מה-payload המוטמע בקישור עצמו (אין צורך בטבלת events — עובד server-side).

### הודעת WhatsApp מלוטשת
מסר עברי נקי עם אימוג'י לפי סוג אירוע + הקישור הקצר בלבד. משולב בזרם השליחה הקיים עם **fallback מלא** לכל כשל.

### תיעוד
README — איך לרענן את ה-preview cache של WhatsApp (FB Sharing Debugger).

3 סטיות מתועדות ב-`docs/tasklists/TASKLIST.R28.md`.

---

## [R27] — 2026-05-17 — Momentum Live שלב 3: מצב חי + חירום + סיכום Wrapped

סוגר את הטריו של Momentum Live. 46 ראוטים, tsc/lint/build ירוקים.

> ⚠️ **לפני deploy** — חובה להריץ ב-Supabase את `supabase/migrations/2026-05-17-event-memories.sql` (טבלת `event_memories` + bucket `event-memories`). בלי זה ה-Memory Album לא יעבוד. **טרם פרוס — ממתין לאישור שהמיגרציה רצה.**

### מצב חי (יום האירוע)
ביום האירוע `/event-day` עובר אוטומטית ל-`LiveModeView` של הזוג: 3 בועות בזמן אמת (הגיעו/אחוז/נותרו) דרך Supabase Realtime (כל צ׳ק-אין → רטט + צליל), כרטיס נוכחות מנהל, פיד פעילות אחרון, פעולות מהירות.

### מצב חירום
חדר בקרה אמיתי ב-`/manage/[eventId]/crisis`: זיהוי קריזות אוטומטי (`lib/crisis.ts` — ספק מאחר / הגעה נמוכה / מקדמה לא מאושרת), כרטיסים עם טיימר "פעיל כבר", כפתורי התקשר/SMS/שידור, `/api/crisis/broadcast` ששולח SMS לכל המנהלים. דחוף אך לא מבהיל.

### סיכום "Wrapped" (רגע השיא)
`/manage/[eventId]/report` הפך ל-מצגת מסך-מלא שמתקדמת אוטומטית (8 שקופיות, פסי התקדמות, tap להחלפה): כתר מסתובב → שעות → אורחים → ריקודים → ספקים → מעטפות → רגעים → תודה + **שיתוף** (קנבס 1080×1920 → Web Share / PNG) + קונפטי. `lib/reportGenerator.ts` חדש. מודאל "הסיכום מוכן!" 24 שעות אחרי האירוע (פעם אחת).

### Memory Album
מיגרציה חדשה מפעילה את מסך ההעלאה (`?mode=upload`, דחיסת תמונה בצד-לקוח) והפיד החי בקיוסק (Realtime) שכבר קיימים בקוד.

5 הערות/סטיות מתועדות ב-`docs/tasklists/TASKLIST.R27.md`.

---

## [R26] — 2026-05-17 — Momentum Live שלב 2: ליטוש חוויית המנהל

עיצוב מחדש של כל מסך שהמנהל רואה — אנימציות, haptic, צליל, קצב יוקרתי. **בלי פיצ'רים חדשים.** 45 ראוטים, כל הבדיקות + 6/6 טסטים ירוקים. כל אנימציה מכבדת `prefers-reduced-motion`, transform/opacity בלבד.

### דף האישור (Accept) — Reveal קולנועי
רקע זהוב עמוק + 3 כדורי זוהר זעירים, כתר 64px שנופל ומסתובב לאט לנצח, רצף הופעה מדורג ("היי {שם} 👋" 56px), כפתור פועם. אחרי אישור: קונפטי זהב, רטט, צליל, "🎉 ברוך הבא לצוות הניהול", הפניה אחרי 1.5 שנ׳.

### דשבורד המנהל
3 "בועות" סטטיסטיקה יוקרתיות עם count-up (הגיעו / אחוז עם טבעת התקדמות / נותרו) + כפתור QR ענק (64px). התראות ה-AI Co-Pilot עכשיו טוסטים שמחליקים מלמעלה, מעוצבים לפי חומרה, החלקה ימינה לסגירה, נעלמים אוטומטית (קריטי נשאר ופועם).

### מסך הצ׳ק-אין
מסגרת סורק עם פינות ציאן וקו-סריקה נע, מונה עם count-up, משוב הצלחה/כשל (רטט + צליל + הבזק ירוק/אדום + טוסט יוקרתי).

### תשתית
`lib/haptic.ts` (רטט עדין), `lib/managerSounds.ts` (צלילים מסונתזים, אופציונלי + מתג בהגדרות), `StatBubble` / `AlertToast` / `ActionSheet` / `Confetti` חדשים.

5 סטיות מתועדות ב-`docs/tasklists/TASKLIST.R26.md` (נתוני RPC לאישור, אין סורק מצלמה אמיתי, צלילים מסונתזים, קונפטי CSS, ActionSheet מוכן לאימוץ).

---

## [R25] — 2026-05-16 — Momentum Live שלב 1: נראות + הזמנה דו-ערוצית

> הספק ביקש "R23" אך ערך R23 כבר תפוס (המחשבונים). נרשם כ-R25. 45 ראוטים, כל הבדיקות ירוקות + 6/6 טסטים.

### נראות
- **בר ניווט תחתון** — הפריט האחרון הוחלף ל-"מצב חי" → /event-day (הגדרות נשארו בתפריט הכותרת).
- **ניווט עליון** — "מצב חי" מופיע אוטומטית כשנותרו ≤21 ימים לאירוע.
- **דשבורד** — כרטיס CTA זוהר חדש (`LiveModeCTA`) כשנותרו ≤14 ימים: "האירוע שלך עוד N ימים. הפעל את Momentum Live".
- **דף יום-האירוע** — באנר ב-3 מצבים: אין מנהל / ממתין לאישור (📤 שלח שוב · ↻ החלף מנהל) / אושר (✅ + קישור לדשבורד הניהולי).

### הזמנה דו-ערוצית (WhatsApp + SMS)
- `buildInviteText` חולץ כמקור-אמת אחד למסר.
- `lib/twilioClient.ts` (server-only) — שליחת SMS דרך Twilio, נופל בחן בלי קרדנציאלס.
- `app/api/manager/invite` — שולח SMS עם אותו מסר, **תמיד מחזיר 200** ו-`waUrl`, כך ש-WhatsApp אף פעם לא נחסם.
- מסך הסיום מציג סטטוס לשני הערוצים.

### בדיקות + תיעוד
- הותקן Vitest + `npm run test`; `tests/managerInvitation.test.ts` (6 מקרים).
- README — סעיף הגדרת Momentum Live (`NEXT_PUBLIC_SITE_URL` חובה, Twilio אופציונלי, 2 מיגרציות).

**Phase 1 בלבד** — לא נגענו ב-/manage/[eventId], Crisis Mode או Auto-Report (Phase 2/3).

---

## [R24] — 2026-05-16 — בקבוקים לפי חברה + העמקת 3 המחשבונים הנותרים

44 ראוטים, כל הבדיקות ירוקות.

### מחשבון אלכוהול — בחירה לפי חברה (התיקון שביקשת)
- ~45 בקבוקים אמיתיים מהשוק בארץ עם **מותג**: יין (ברקן/כרמל/רקנאטי/ירדן/תבור), בירה (גולדסטאר/מכבי/טובורג/קרלסברג/Heineken כולל חביות), אלכוהול חזק (Smirnoff/Absolut/Grey Goose/Johnnie Walker/Chivas/Jameson/Jack/Gordon's/Bombay/Olmeca), קל (קוקה-קולה/פפסי/ספרייט/פריגת/שוופס/נביעות).
- הבורר מוצג **מקובץ לפי חברה**, הכותרת עודכנה והסעיף **נפתח כברירת מחדל** כדי שיהיה גלוי.

### העמקת 3 המחשבונים
- **💎 כמה אורח עולה** — "מה אם יהיו __ מוזמנים?" שמחשב מחדש מחיר לאורח בזמן אמת.
- **🤖 3 הצעות AI** — בחבילה שנבחרה אפשר לערוך כל קטגוריה ידנית; סכום ומחיר לאורח מתעדכנים חי.
- **💌 מעטפה** — פאנל "בדיקת תרחיש": שינוי עלות אירוע / מספר מוזמנים והמלצה מתחשבת — בלי לגעת בתקציב האמיתי.

---

## [R23] — 2026-05-16 — העמקת מחשבון אלכוהול + "מעבדת התקציב"

העמקה ב-2 המחשבונים הראשונים (השאר בסבבים הבאים). 44 ראוטים, כל הבדיקות ירוקות.

### מחשבון אלכוהול — בחירת בקבוקים ספציפית
- קטלוג מוכן של 18 בקבוקים נפוצים בארץ (יין/בירה/אלכוהול חזק/קל) עם מחיר משוער.
- סעיף "🍾 בחירת בקבוקים ספציפית": לכל קטגוריה — פס כיסוי (כמה מנות סופקו מול הצורך, ירוק כשמכוסה), בחירה מהקטלוג, "בקבוק משלי", ו**עריכה ידנית של שם / מחיר / מנות / כמות** לכל שורה.
- מתג "השתמש בבחירה הספציפית לחישוב העלות" — סך העלות מתעדכן לפי הבקבוקים שבחרת.
- הבחירה נשמרת אוטומטית.

### What If Simulator → **מעבדת התקציב**
- שונה השם בכל מקום (טאב + כותרת). קישורי deep-link הקיימים ממשיכים לעבוד.
- 3 בקרות חדשות: עיצוב ופרחים (בסיסי/סטנדרטי/מפואר), הזמנות (דיגיטלי/מודפס/יוקרה), ותוספות צילום (אלבום/רחפן/מגנטים/Same-Day) — כל אחת עם הסבר השפעה.

---

## [R22] — 2026-05-16 — ארגון מחשבונים מחדש + מחשבון AI

ה-4 מחשבונים פוצלו ל-**5 טאבים נפרדים** + נוסף מחשבון חמישי חדש. 44 ראוטים, כל הבדיקות ירוקות.

### חדש
- **🤖 3 הצעות מחיר AI** — אותו תקציב, 3 חבילות שונות לפי 3 עדיפויות שתבחר. כל חבילה: מחיר לאורח, ✓מקבל / ✗מתפשר, מד-וייב, כפתור בחירה. עובד עם OpenAI כשמוגדר, אחרת fallback חכם דטרמיניסטי. נקודת קצה `/api/ai/packages` (Bearer, 503 ללא מפתח, 5/יום).

### ארגון מחדש
- ה-Hub נכתב מחדש לניווט **טאבים** — pills יוקרתיים עם scroll-snap במובייל, glow זהב לפעיל, מעבר fade, שמירת מיקום ב-URL hash + localStorage, נגישות מלאה (role=tab, ניווט בחיצים).
- כל מחשבון בעטיפת עיצוב אחידה (`CalculatorCard` חדש): כותרת + רקע זהב + טיפ 💡.
- מחשבון אלכוהול חולץ לקומפוננטה `<AlcoholCalculator/>` (עמוד /alcohol הפך ל-wrapper, deep link עדיין עובד).
- מחשבון מעטפה + פילוח קרבה חולצו ל-`<EnvelopeCalculator/>`.

### ניקוי
- הוסרו ~385 שורות קוד כפול מ-`budget/page.tsx` (Envelope/Scenario/Relationship), imports ואייקונים לא בשימוש. אין יותר לוגיקה כפולה.

### הערות
- 3 סטיות מכוונות מהספק מתועדות ב-`docs/tasklists/TASKLIST.R22.md` (עטיפת CalculatorCard, rate-limit in-memory, יחידות ₪).

---

## [R21] — 2026-05-16 — מרכז מחשבונים חכמים

טאב **🧮 מחשבונים חכמים** חדש ב-`/budget` שמאחד 4 מחשבונים בעיצוב יוקרתי.
כל הבדיקות ירוקות (`tsc` / `lint` / `build`, 43 ראוטים).

### מחשבונים חדשים
- **💎 כמה אורח באמת עולה לי?** — פירוק עלות ל-7 קטגוריות, מספר ענק עם count-up, פסים אופקיים עם popover, אינסייטים חכמים (חריגות אוכל/אלכוהול/צילום), כפתור שיתוף ל-WhatsApp. משתמש בתקציב האמיתי אם יש ≥3 שורות, אחרת בממוצעים בארץ (4 דרגות).
- **🎚️ What If Simulator** — סליידר מוזמנים (50–400) + 4 קבוצות בחירה (אולם/מנות/בר/צלם), חישוב חי, פלאש זהב/אדום על שינוי, "החיסכון שלך שווה ל:" עם שקילויות, שמירת סימולציה ואיפוס. תמחור אולם **לא-לינארי**.

### איחוד
- מחשבון האלכוהול והמעטפה הקיימים נארזו באותו hub (כרטיס קישור / סיכום חי).
- ליד כל מחשבון — טיפ קצר חכם 💡.

### עיצוב
- סליידר זהב עם thumb זוהר ויעד-מגע 44px, מספרי-ענק `gradient-gold`, רקעי זהב רכים, ריספונסיבי (1 טור במובייל → 2×2 בדסקטופ).

### הערות
- הלוגיקה הותאמה למבנה הנתונים האמיתי (`budget: BudgetItem[]`, לא `budget.total`). פירוט מלא ב-`docs/tasklists/TASKLIST.R21.md`.

---

## [R20] — 2026-05-16 — שיפורי ביצועים שלב 1 (ללא שינוי ויזואלי)

**אופטימיזציות פנימיות בלבד — אפס שינוי בעיצוב, blur, orbs או אנימציות.**
כל הבדיקות ירוקות (`tsc` / `lint` / `build`, 43 ראוטים).

### תמונות → next/image
- `next.config.ts` — נוסף `remotePatterns` ל-`images.unsplash.com` (היקף מצומצם, לא פרוקסי פתוח).
- הומרו ל-`next/image` כל התמונות מבוססות-Unsplash: כרטיס ספק, גלריית ההשראה (8, עם `priority` ל-2 הראשונות), עמוד ההשוואה, ו-VendorQuickLook (×2). תיראה זהה — נטענת חכם (srcset/WebP/lazy).
- תמונות שהושארו ב-`<img>` במכוון: העלאות משתמש (Supabase storage / דומיינים לא-מנוהלים), ו-`data:`/`blob:` — המרה הייתה שוברת אותן או דורשת פרוקסי פתוח. מתועד ב-`docs/tasklists/TASKLIST.R20.md`.

### עמוד ספקים — O(1) במקום O(n)
- `selectedIds` / `compareIds` כ-`Set` ממואיזד; הכרטיסים משתמשים ב-`.has()` במקום `Array.includes()` לכל כרטיס בכל רינדור.

### ScrollProgress — בלי setState בכל frame
- הוחלף `useState` ב-`ref`; ה-transform נכתב ישירות ל-DOM בתוך ה-rAF. אפס רינדורים מחדש בזמן גלילה. הוויזואל זהה.

---

## [R18] — 2026-05-16 — ליטוש חוויית משתמש (Phone OTP, Empty states, Wizards, Polish)

**19 תיקונים על פני 4 בלוקים.** כל בלוק עבר `tsc --noEmit`, `npm run lint`, `npm run build` בנפרד (43 ראוטים).

### הרשמה ו-Onboarding
- **קוד OTP בטלפון** — כפתור "שלח שוב" עם ספירה לאחור של 30 שניות, זהה לזרימת המייל.
- **הסכמה לתנאים** — לחיצה על כפתור התחברות לפני סימון התיבה מפעילה פעימת-תשומת-לב (3×600ms) על תיבת ההסכמה; הכפתורים מעומעמים עד לסימון.
- **טלפון מארח** — מילוי אוטומטי גם בהרשמת Google/מייל (מ-Supabase); שדה חובה עם הסבר "ללא טלפון אורחים לא יוכלו לאשר הגעה".
- **בחירת תאריך** — לא מתאפסת תוך כדי הקלדה; נוסף בורר תאריך native כאופציה ראשית + "או הקלד ידנית".
- **הזמנה קבוצתית** — מעבר אוטומטי למוזמן הבא לאחר חזרה מ-WhatsApp (ניתן לכיבוי).

### Empty states + הצטרפות ספקים
- **רשימת מוזמנים ריקה** — כפתור ראשי "ייבא מאנשי קשר", עם fallback להדבקת רשימה בדפדפנים ללא Contacts API.
- **הצטרפות ספק** — אשף 3 שלבים עם פס התקדמות במקום טופס 13 שדות.
- **כרטיס ספק** — pill בולט "הוסף לרשימה שלי" עד שמירת הספק הראשון.

### עקביות UX
- **דשבורד ספק חדש** — באנר ייעודי עם קישור להעתקה + QR + טיפ, כשעדיין אין תנועה.
- **Toast** — הורם כדי לא לשבת על ה-bottom nav במובייל.
- **רשימת מוזמנים** — וירטואליזציה (`@tanstack/react-virtual`) מעל 80 מוזמנים.
- **רכיבי קלט משותפים** — `MoneyInput` (₪) ו-`PhoneInput` (+972).
- **שגיאות הרשמה** — הודעת fallback אחידה + לוג `[momentum/signup]`.
- **`formatEventDate`** — helper מרכזי לתאריכים (`lib/format.ts`).

### ליטוש
- כפתור "מתחבר..." עם טקסט מפורש.
- כפתורי סגירה אחידים (44×44) בכל המודלים + רכיב `Modal` משותף.
- חימום מוקדם של קישורי WhatsApp; הכפתור disabled עד שהקישור מוכן.
- שדרוג מסלול דרך מודל (`UpgradePlanModal`) במקום ניווט.
- **הוכחה חברתית כנה** — הוסרו מספרים מומצאים ("4,872 אירועים", "4.9★ מ-2,341 ביקורות"); הוצגו רק נתונים אמיתיים/מסומנים כמשוערים.

### הערות
- Commit יחיד (לבקשת המשתמש), אך אומת בלוק-בלוק.
- `<QrCanvas>` / `<Modal>` נוצרו מאפס (לא היו קיימים).
- §L/§N — רכיבים/helper נוצרו וחוברו לנקודות מייצגות; החלפה גורפת נדחתה מכוונת כדי לא לגרום לרגרסיית פורמט (מתועד ב-`docs/tasklists/TASKLIST.R18.md`).

---

## [R12] — 2026-05-13 — security + bugs + UX

**26 fixes across 4 priority blocks.** All blocks green on `tsc --noEmit`, `npm run lint`, `npm run build`.

### Security (P0)
- **JSON-LD XSS** — new `lib/jsonLdSafe.ts` escapes `<`/`>`/`&`/`'` before injecting into the public vendor landing's `<script type="application/ld+json">`. Vendor-controlled names can no longer break out of the script tag.
- **Vendor review RLS** — `vendor_review_responses` insert/update now require the responder to own the vendor (`vendor_landings.owner_user_id`).
- **vendor_cost_reports** — requires auth + dedupes per (user, category, region, guest-band); pollution attack capped at 1 row per bucket.
- **Page-view analytics** — SELECT closed to vendor owner only; INSERT rate-limited via a trigger (50/vendor/hour).
- **vendor_reviews** — INSERT must target a real published landing.
- **API error leakage** — `/api/admin/stats`, `/api/cfo/extract`, and `/auth/callback` no longer leak Postgres/Supabase message text; everything goes to console.
- **/api/cfo/extract hardening** — 5 MB image cap, MIME prefix gate, 20/day quota.
- **CSP** — moved to `middleware.ts` with per-request nonce + `'strict-dynamic'`; `script-src 'unsafe-inline'` removed. `connect-src` pinned to the specific Supabase project.

### P0 bugs
- **Admin dashboard** — no more infinite spinner; full load wrapped in try/catch/finally with AbortController.
- **ShareEventCard** — Object-URL leak fixed via a stable Set ref.
- **theme.ts** — DOM mutation moved out of render into `useEffect`.
- **Transparency tab** — hidden behind a flag until the post-event reporting form ships.

### P1 bugs
- OAuth probe no longer flickers buttons disabled on transient probe failures.
- useEffect deps narrowed in 3 places (event-day, ShareEventCard, onboarding).
- AssistantWidget pops the orphan user message when closed mid-thinking.
- parseFloat/parseInt clamps + comma-stripping in three forms.
- Auth callback has a 12-second hard timeout.
- 6 ad-hoc localStorage keys centralized into `STORAGE_KEYS`; separator unified to `.`.
- Slug fallback in vendor-studio uses `crypto.randomUUID().slice(0,6)`.
- `tel:` links normalized via `normalizeIsraeliPhone` in `VendorLandingClient`.

### UX
- Global `padding-bottom` on `body` clears the mobile bottom nav (pages no longer need `pb-24`).
- Header buttons hit the WCAG 44×44 touch-target floor.
- Admin dashboard "no activity" uses the shared `<EmptyState />` instead of bare text.
- Signup confirmation screen now has a **"שלח שוב"** button with cooldown.
- Submit + resend buttons show their spinner inline (no layout jump).

### Manual Supabase step required before deploy
Run `supabase/migrations/2026-05-13-vendor-review-fixes.sql` in the Supabase SQL Editor.

---

## [Unreleased] — מאי 2026 (pre-launch)

### Added
- **AI Invitations (Premium)** — עיצוב הזמנות ברקע AI (Replicate Flux Schnell) + טקסט עברי ב-Canvas, עם quota של 20/חודש
- **Vendor Onboarding Phase 0** — `/vendors/join` להגשת בקשות, `/admin/vendors` לאישור
- **3 מסלולי ספקים** — חינם / רגיל (199₪) / פרימיום (499₪)
- **Dual-entry flow** — `/start` עם בחירה בין "מתכנן אירוע" ל"ספק"
- **`/vendors/welcome`** — מסך 3 מסלולי תמחור לספקים
- **`/vendors/my`** — CRM אישי לספקים (מחיר סוכם, מקדמה, פגישה, סטטוס, דירוג, הערות)
- **מחשבון אלכוהול** (`/alcohol`) — חישוב כמויות יין/בירה/חזק/מים/קרח לפי קהל
- **`lib/origin.ts`** — single source of truth ל-public origin
- **`lib/phone.ts`** — Israeli phone normalization מאוחד
- **`lib/vendorApplication.ts` + `lib/vendorNotifications.ts`** — תשתית ספקים
- **`scripts/tunnel-and-dev.sh`** — `npm run dev:public` עם cloudflared tunnel + auto-update env
- **Email + WhatsApp notifications** ל-admin (Resend + CallMeBot, optional)
- **`components/Footer.tsx`** — footer חדש
- **`components/PricingTiers.tsx` + `VendorPricingTiers.tsx`** — רכיבים משותפים

### Changed
- **`/vendors/page.tsx`** — כפתור Heart הוחלף ב-"+ הוסף לרשימה שלי" מפורש
- **PROJECT_OVERVIEW.md** — עודכן מקצה לקצה (8/5 → 10/5)
- **00-קרא-אותי-קודם.md** (Desktop) — עדכון סטטוס + פיצ'רים חדשים
- **lib/user.ts** — משתמש ב-`tryGetPublicOrigin()` במקום `window.location.origin`
- **`/start`** — שונה מ-pricing gate ל-מסך בחירה דו-מסלולי

### Deprecated
- **`lib/israeliCalendar.ts`** — DISABLED 10/5/2026. שמור כ-stubs נטרליים. להחזיר: `git restore` מהיסטוריה.

### Removed
- **`.env.local.example`** — נמחק (כפילות של `.env.example`)
- **`lib/israeliCalendar.ts`** functionality — הקובץ נשאר אבל הפונקציות מחזירות defaults

### Fixed (R6 — 10/5)
- **P0**: redirect loop ב-`/onboarding` כשלמשתמש כבר יש אירוע
- **P1**: `/auth/callback` מדלג על `/start` ויוצר loop
- **P1**: `/start` כפתורי tier כולם מובילים לאותו URL
- **P1**: `mailto:` link שבור ב-PricingTiers
- **P1**: `Footer` `hover:text-white` שובר light mode
- **P1**: `/start` חסר Footer (עקביות)
- **P1**: אישור ספק לא מוסיף לקטלוג (TODO documented)

### Fixed (R5 — 10/5)
- **P0**: RLS חסר על `admin_emails` — כל ה-admin flow היה שבור
- **P0**: `...body` spread ב-vendor apply — ספק יכל לאשר את עצמו
- **P0**: Category enum bypass
- **P0**: RLS ב-`vendor_applications` לא חוסם status מנופח
- **P1**: Phone normalization חסר ב-vendor apply
- **P1**: XSS דרך `javascript:` URLs
- **P1**: NaN עובר את validation של years_in_field
- **P1**: Double-decide race ב-admin
- **P1**: `lib/user.ts` לא השתמש ב-origin.ts
- **P1**: event-day QR מציג path יחסי כש-origin ריק
- **P1**: Notification timeout missing

### Fixed (R4 — 10/5)
- **P0**: `sync.ts` overwrites local edits on login (data loss)
- **P0**: `inbox/page.tsx` useEffect double-import via stale closure
- **P0**: `store.ts` race ב-`mintSigningKeyAtomic` מרובה-טאבים
- **P0**: `eventSlots.ts` BroadcastChannel cross-slot override
- **P0**: `settings/page.tsx` `Notification.requestPermission` תקיעה ב-iOS PWA
- **P0**: `live/[eventId]` CountdownOrLive לא מתעדכן מ-hidden tab
- **P0**: `rsvp/RsvpClient.tsx` respond double-submit
- **P1**: `phone.ts` `+9720...` מייצר 13 ספרות שבורות
- **P1**: `user.ts` שימוש ב-`normalizeIsraeliPhone` במקום inline
- **P1**: Bulk Invite double-tap ב-iOS
- **P1**: vendors page Quick Look effect loop
- **P1**: 4 מודלים ללא Esc-to-close
- **P1**: Find My Table double-submit + case-sensitive

### Fixed (R3 — 9/5, אבטחה)
- 20 פרצות (5 P0, 9 P1, 6 הקשחה) — CSP, HMAC validation, RLS
- 24 באגים תפקודיים — תזכורות בשבת, WhatsApp link, /guests stuck, smart arrangement delay

### Security
- **CSP החדש** מתיר `replicate.delivery` ו-`*.supabase.co` ל-images
- **HMAC tokens** במקום payload-in-URL — לא חושף PII
- **AES-GCM IV** אקראי לכל envelope (no reuse)

---

## [Initial development] — אפריל-מאי 2026

### Added (R1+R2 setup)
- מבנה Next.js 16 + React 19 + TypeScript strict
- Tailwind v4 + design tokens
- Supabase auth + RLS + schema
- 17 מסכים ראשוניים (onboarding, dashboard, guests, RSVP, seating, vendors, etc.)
- Multi-event "slots" — תכנון של כמה אירועים במקביל
- BroadcastChannel sync בין tabs
- Web Crypto (HMAC, AES-GCM, HKDF)
- Israeli halachic calendar (לפני ביטול)
- Hebrew RTL native support
- 9 security headers
- GitHub Actions CI (lint + tsc + audit + build)
- 284 ספקים בקטלוג סטטי

### Fixed (R1+R2)
- 30+ באגים בסבבים הראשוניים (set-state-in-effect, popup blocker, STORAGE_KEYS, escape/unescape, memory leak ב-sync, etc.)

---

## Migration Notes

### לעבור מ-`window.location.origin` ל-`getPublicOrigin()`
היה: `const origin = typeof window !== "undefined" ? window.location.origin : "";`
עכשיו: `const origin = tryGetPublicOrigin();`

→ דורש `NEXT_PUBLIC_SITE_URL` ב-`.env.local` בכדי שיעבוד ב-SSR.

### להחזיר Israeli Calendar
```bash
git log --oneline lib/israeliCalendar.ts
git restore --source=<commit_hash> lib/israeliCalendar.ts
```

### Migration ל-`savedVendorIds[]` → `savedVendors[]`
אם state ישן יש לו `savedVendorIds: string[]`, הוא יומר אוטומטית ל-`savedVendors: SavedVendor[]` עם `status: "lead"` לכל אחד (migration ב-`lib/store.ts`).
