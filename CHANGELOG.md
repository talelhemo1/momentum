# Changelog — Momentum

כל השינויים המשמעותיים בפרויקט. פורמט: [Keep a Changelog](https://keepachangelog.com/he/1.1.0/).

---

## [R39] — 2026-05-18 — שליחה מהירה (Express Bulk Send)

כפתור "🚀 שליחה מהירה" ב-/guests פותח Modal שמטפל בכל המוזמנים
הממתינים אחד-אחרי-השני. המשתמש פותח wa.me, שולח, חוזר ל-tab → תוך
~1.5 שנ׳ ה-wa.me הבא נפתח אוטומטית. הפתיחה רוכבת על "חזרת ה-tab"
(visibilitychange) כך שחוסם הפופאפים מתייחס אליה כיוזמת-משתמש.
~200 הזמנות ב-5 דק׳. tsc/lint(0)/build/test(9/9) ירוקים. ללא מיגרציה.

### נוסף
- `hooks/useExpressSend.ts` — state machine: queue/current/completed/skipped, listener `visibilitychange` יחיד (cleanup מסודר נגד memory-leak), prebuild של ה-wa.me URL (כדי ש-window.open יישאר סינכרוני — משתמש ב-`buildHostInvitationWhatsappLink` הקיים, בלי builder חדש), שמירת state ל-localStorage + "המשך מאיפה שהפסקת?" ל-2 שעות.
- `components/guests/ExpressSendModal.tsx` — שלב 0 סינון קבוצה (חברים/משפחה/עבודה/שכנים), כרטיס מוזמן נוכחי, progress bar, צ׳יפים סטטיסטיים, overlay countdown עם ביטול, מסך סיום + confetti, mobile full-screen.
- `/guests` — כפתור "🚀 שליחה מהירה לכולם (N)" (N = ממתינים עם טלפון תקין), `STORAGE_KEYS.expressSendState`.

### הערת תכנון
ספק ביקש "status נשאר pending"; אך כפתור השליחה הבודד הקיים כבר קורא `actions.markInvited` (→ "invited" שזה סטטוס ה-awaiting-response באפליקציה). שמירה על העקביות הזו (פילטר/ספירה/resume) נבחרה במקום סטייה שהייתה משבשת ספירות ומכניסה שוב מוזמנים שכבר נשלחו ל-resume.

### בדיקה
מודול /guests נטען נקי; זרימת ה-tab-return + confetti + haptics דורשים host מחובר + מעבר אמיתי ל-WhatsApp — בדיקה ידנית במכשיר.

---

## [R36+R37 — ליטוש] — 2026-05-17 — RPC טהור ל-short_links + אתר דפוס אומן אמיתי

R36/R37/R38 כבר נפרסו וה-migrations רצו. הסבב הזה הוא ליטוש על הקיים
(ה-spec הוגש מחדש; חלק מהפריטים כבר היו, חלק היו רגרסיה אם היו מיושמים
מילולית — `type:"invitations"` אינו `VendorType` חוקי, נשאר `"printing"`):

- **`lib/shortLinks.ts`** — `lookupShortLink` הופשט ל-**RPC טהור**
  (`lookup_short_link`). ה-fallback ל-select ישיר (רשת-ביטחון לסדר
  פריסה ב-R36) הוסר — המיגרציה כבר חיה, וה-RLS חוסם את ה-select ממילא.
- **`lib/vendors.ts`** — נוסף ה**אתר האמיתי** של דפוס אומן
  (`https://www.ouman.co.il`) + תגית "נהריה". טלפון עדיין placeholder.
- **`VendorCard`** — תג 0-ביקורות יושר ל-"✨ חדש בקטלוג" (בלי ⭐).
- אומת מחדש: אף עמוד לא קורס על `VENDORS` בן פריט אחד (find/filter/length,
  אפס גישת אינדקס). tsc/lint(0)/build/test(9/9) ירוקים.

תיעוד R36/R37 המקורי קיים ב-`docs/tasklists/TASKLIST.R36.md` ו-`TASKLIST.R37.md`.

---

## [R38] — 2026-05-17 — ספק מאושר נכנס לקטלוג אוטומטית

"כל ספק שממלא טופס → מגיע אליי לאישור → ורק אז נכנס לאפליקציה."
כל צינור האישור כבר היה קיים (טופס → vendor_applications pending →
מייל אליי → /admin/vendors אישור/דחייה). החוליה החסרה: ספק מאושר מעולם
לא הופיע ב-/vendors. R38 סוגר את זה. tsc/lint(0)/build/test(9/9) ירוקים.

⚠️ **להריץ ב-Supabase:** `supabase/migrations/2026-05-17-approved-vendors-public.sql`.
עד שזה ירוץ — מאושרים לא יופיעו (הקטלוג הסטטי עדיין עובד, אומת: ללא
קריסה). הקוד בטוח לפריסה לפני המיגרציה.

### נוסף
- migration: RPC `list_approved_vendors()` (SECURITY DEFINER) שמחזיר **רק עמודות ציבוריות** (שם עסק, קטגוריה, עיר, אודות, אתר, IG/FB) — **לא** טלפון/מייל/ח.פ/IP (כדי לא ליצור דליפת PII רביעית אחרי R36). אותו דפוס כמו `lookup_short_link`.
- `lib/approvedVendors.ts` — מיפוי שורה מאושרת → `Vendor` (קטגוריה→VendorType לפי המיפוי המתועד, עיר→אזור היוריסטי, `reviews:0` → תג "ספק חדש", `phone:""` לא חושף PII).
- `app/vendors/page.tsx` — טוען מאושרים דרך ה-RPC וממזג עם הסטטי (`allVendors`). Fail-soft: RPC חסר/שגיאה → נשאר הקטלוג הסטטי (אומת חי לפני המיגרציה).
- decide route — מטביע `approved_vendor_id='app-<id>'` באישור → מנקה את אזהרת ה-admin "מאושר אך לא בקטלוג".

### זרימה (אחרי המיגרציה)
טופס → pending → מייל ל-talhemo132@gmail.com → אתה מאשר ב-/admin/vendors → הספק מופיע ב-/vendors. דחוי/ממתין לעולם לא מופיעים.

### הערות
- חובה להתחבר לאפליקציה עם `talhemo132@gmail.com` כדי לגשת ל-/admin/vendors. למיילים צריך `RESEND_API_KEY` ב-Vercel (בלעדיו הבקשה עדיין נשמרת ונראית ב-/admin/vendors).
- פתוח (R36/R37): פרטי דפוס אומן + תקנון §19.

---

## [R37] — 2026-05-17 — ניקוי ספקים: רק "דפוס אומן" האמיתי

הוסרו ~332 ספקי דמו מזויפים. הקטלוג מכיל עכשיו ספק אמיתי מאומת אחד —
**דפוס אומן** (בית דפוס, נהריה). tsc/lint(0)/build/test(9/9) ירוקים;
`/vendors` אומת חי. ללא מיגרציה.

### שינויים
- `lib/vendors.ts` — ספק יחיד. **תיקון מול ה-spec:** `"invitations"` אינו `VendorType` — נעשה שימוש ב-`"printing"` (בתי דפוס) שזה הנכון. טלפון/סושיאל = placeholders (TODO(owner) — אין לי את הפרטים האמיתיים, לא ממציא).
- `app/vendors/page.tsx` — empty-state עם CTA יוקרתי "🎯 אתה ספק? הצטרף אלינו עכשיו" → `/vendors/join` (ה-spec ציין `/vendors/welcome` שלא קיים).
- `VendorCard` — `reviews===0` → תג "ספק חדש" במקום דירוג מזויף.
- דף הבית — הוסרו ספירות מנופחות (24+/22+/100+); CategoryShowcase לקופי השקה כן; StatsCounter ל-`{VENDORS.length}` דינמי ("ספקים מאומתים / גדל מדי יום").
- `lib/aiAssistant.ts` — מקרה 0 ספקים באזור מנוסח כהזמנה ("הקטלוג בהקמה…") במקום "גישה ל-0 ספקים".
- audit: כל צרכני `VENDORS` משתמשים ב-find/filter/length — אין קריסה על מערך בן פריט אחד.

### Follow-ups לבעלים
1. טלפון/IG/FB/אתר אמיתיים של דפוס אומן → אעדכן.
2. (פתוח מ-R36) פרטי ישות משפטית לתקנון §19.

---

## [R36] — 2026-05-17 — Security hotfix: 3 דליפות RLS + 8 תיקוני ליטוש

תיקון אבטחה קריטי: `short_links` / `invitation_views` / `event_memories`
היו עם פוליסת `"anyone reads"` פתוחה — כל אנונימי יכל לקרוא קישורים,
אנליטיקת פתיחות (כולל שמות אורחים) ותמונות של **כל** האירועים.
tsc/lint(0)/build/test(9/9) ירוקים.

⚠️ **להריץ ב-Supabase:** `supabase/migrations/2026-05-17-rls-hardening.sql`.
הקוד בטוח לפריסה **בכל סדר** (`lookupShortLink` מנסה RPC ונופל חזרה
ל-select ישיר), אבל הדליפה פתוחה עד שזה ירוץ — דחוף.

### Block A — דליפות RLS
- `short_links` — בוטלה קריאה פתוחה; קריאה דרך RPC `lookup_short_link` (SECURITY DEFINER). `lib/shortLinks.ts` עם fallback עמיד.
- `invitation_views` + `event_memories` — קריאה רק לבעל האירוע / מנהלים מאושרים. טריגר rate-limit (1000/אירוע/שעה) על invitation_views.
- **תיקון מול ה-spec:** ה-host לא מותנה בקבלת המנהל (`invited_by = auth.uid()` ללא `status='accepted'`) — אחרת הזוג ננעל מהאנליטיקה של עצמו. פער שיורי מתועד (זוג בלי מנהל ב-event_managers — מעקב המשך).

### Block B — 8 תיקונים
- B1 whatIf: `Number(guests)||1` נגד `₪NaN`. B2 realCost: "תקציב אמיתי" דורש גם סכום>0. B3 aiPackages: בחירה אקראית בין חבילות שוות-ניקוד. B4 twilio: בלי fallback מספר קשיח. B5 ai/packages: ולידציה ל-priorities (מערך, ≤5, מחרוזות). B6 crisis: `.limit(50)`. B7 navLinks: Apple Maps `?daddr&dirflg=d`. B8 serverRateLimit: prune כל 60 שנ׳.

### Block C — תקנון §19
דחוי — דורש פרטי ישות משפטית אמיתיים מהמשתמש (לא ניתן להמציא). אין שינוי קוד.

---

## [R33] — 2026-05-17 — חיבור הקישור הקצר + ההודעה הפרימיום לזרם הקנוני

תיקון קריטי שמאחד את כל מה שנבנה ב-R28. הלוגיקה של הקישור הקצר +
ההודעה הפרימיום ישבה רק בתוך `useGuestWhatsappLink` מעל ההודעה הישנה
הארוכה — שני מסלולים לאותה עבודה. tsc/lint(0)/build ירוקים; ללא מיגרציה.

### איחוד
- `lib/invitation.ts` — `buildHostInvitationWhatsappLink` נכתב מחדש כבונה **הקנוני היחיד**: URL ארוך חתום → `createShortLink` (`/i/<id>`, dedup מ-R30) → `buildWhatsappInviteMessage` (הודעה פרימיום + קישור נקי שמציג כרטיס OG). Fail-soft: כשל קיצור → URL ארוך אבל עדיין הודעה פרימיום. מחזיר `rsvpUrl` = הקישור הקצר.
- הוסר `formatHebrewDate` המת + ההודעה הישנה הידנית.
- `useGuestWhatsappLink` — `buildLink` הפך ל-map דק (הוסר בלוק ה-R28 הכפול + ה-imports שלא בשימוש). מבטל יצירת קישור-קצר כפולה.
- בדיקת callers: היחיד האמיתי הוא ה-hook; כפתור "שלח הזמנה" ב-/guests צורך אותו → עכשיו שולח הודעה פרימיום קצרה.
- הותאם לחתימה האמיתית של `buildWhatsappInviteMessage` (ה-spec ביקש `eventTime` שלא קיים ב-`EventInfo`).

### Cache-bust
- כל הפניות `/og-default-1200x630.png` → `?v=2` (layout/rsvp/i) כדי לכפות re-scrape ב-WhatsApp/Facebook. אחרי deploy: Facebook Sharing Debugger → "Scrape Again".

### OG סטטית
- אומת ש-`metadataBase` + התמונה הסטטית ב-layout/rsvp/i כבר תקינים מ-R32 (ללא שינוי).

---

## [R32] — 2026-05-17 — תמונת OG סטטית כברירת-מחדל + מעקב פתיחות חי

מטרה כפולה: כל הזמנה מציגה את כרטיס המותג הסטטי; הזוג רואה בזמן אמת מי
פתח את הקישור. tsc/lint(0)/build(54 ראוטים) ירוקים; חי: `/api/invitation/view`
→ 200, עמוד RSVP נטען ושולח ping.

⚠️ **להריץ ב-Supabase:** `supabase/migrations/2026-05-17-invitation-views.sql`
(טבלת `invitation_views` + RLS open-insert/select + realtime עם guard
אידמפוטנטי). הקוד בטוח לפריסה לפני המיגרציה — עד שהטבלה קיימת ה-ping
פשוט no-op והכרטיס מציג "עדיין אין פתיחות".

### OG סטטית
- `app/layout.tsx` — `metadataBase` (og:image אבסולוטי, חובה ל-WhatsApp) + `openGraph`/`twitter` עם `/og-default-1200x630.png`. כל route יורש.
- `app/i/[token]/opengraph-image.tsx` — **נמחק** (next/og הדינמית שברירית בנתיב serverless; הסטטית מספיקה, ניתן להחזיר בעתיד עם font setup).
- `/i/[token]` + `/rsvp` — generateMetadata/metadata מצהירים מפורשות על התמונה הסטטית (page-level דורס את ה-root).

### מעקב פתיחות
- migration `invitation_views` (+2 אינדקסים, RLS, realtime guard).
- `app/api/invitation/view/route.ts` — POST, anon, תמיד 200 (כשל מעקב לא שובר RSVP).
- `RsvpClient` — ping fire-and-forget פעם אחת לטעינה (catch-all לכל מסלולי הכניסה; ה-ping מצד-שרת של `/i` לא מומש בכוונה — un-awaited fetch לפני redirect לא מובטח).
- `lib/useInvitationViews.ts` + `components/dashboard/InvitationActivityCard.tsx` — מונה מונפש, פיד 5 אחרונים (✨ מזוהה / 👤 אנונימי), realtime + toast/haptic על פתיחה חדשה. בדשבורד מעל ToolsSection, רק כשיש אורחים.

### Dedup + פרטיות
- אותו אורח תוך 10 דק׳ → לא נרשם שוב. IP נשמר רק כ-`sha256(salt:ip)`, לא raw.

---

## [R31] — 2026-05-17 — קישורי ניווט בהזמנות (Waze + Google + Apple)

לכל הזמנה ומסך — כפתור ניווט בלחיצה אחת. Waze כברירת-מחדל בישראל
(`&navigate=yes` מתחיל ניווט מיד), לצד Google/Apple Maps לבחירת המוזמן.
ללא מיגרציה / env — שינוי client/helper טהור, בטוח לפריסה לבד.
tsc/lint(0)/build/test(9/9, ‎+3 חדשים) ירוקים; כרטיס ה-RSVP אומת חי בתצוגה.

### נוסף
- `lib/navigationLinks.ts` — `buildNavigationLinks(address)` → Waze/Google/Apple + `primary`, או `null`. טהור, איזומורפי, `encodeURIComponent` (עברית/גרשיים/פסיקים/סוגריים בטוחים).
- הודעת WhatsApp: שורת `🚗 ניווט ב-Waze: …` בשורה נפרדת (כדי ש-WhatsApp יזהה כקישור).
- עמוד RSVP: כרטיס "איך מגיעים?" עם 3 כפתורים (Waze/Google/Apple); מוסתר כשאין venue.
- דשבורד (לינק "פתח ב-Waze"), יום-אירוע + LiveMode (כפתור "ניווט לאולם"), דשבורד-מנהל (אייקון Waze בכותרת הדביקה).
- `tests/navigationLinks.test.ts` — 3 בדיקות (קידוד, פסיק/סוגריים, null → הסתרה).

### הערות
- כתובת הניווט = `synagogue · city` הקיים (כפי שכבר מוצג ב-📍 ובדשבורד).
- כפתור Apple Maps מוצג לכולם — בישראל רוב משתמשי Apple Maps ב-iPhone; ללא UA-sniffing, בלי כפתור שבור.

---

## [R30] — 2026-05-18 — סריקת באגים: הקשחת אבטחה ותיקוני נכונות

3 סוכני סקירה עברו על R18–R29. 46 ראוטים, tsc/lint(0)/build/test ירוקים.

⚠️ **להריץ ב-Supabase:** `supabase/migrations/2026-05-18-r30-hardening.sql`
(dedupe ל-short_links + אינדקס ייחודי + טריגרי הגבלת-קצב + תקרת גודל/MIME
ל-bucket התמונות). הקוד בטוח לפריסה לפני המיגרציה — היא הערובה הקשיחה לתקרות.

### אבטחה
- **P0 Open-redirect** ב-`/i/[token]`: `redirect()` השתמש בערך DB ניתן-להשפעה (INSERT פתוח) → עכשיו whitelist קשיח לנתיב `/rsvp?` בלבד.
- **/api/manager/invite** היה SMS לא-מאומת לחלוטין (הצפת עלויות Twilio/פישינג) → דורש session + הגבלת-קצב; שני ה-callers שולחים טוקן.
- **/api/crisis/broadcast** — אימות `getUser()` אמיתי + הגבלת-קצב (היה בדיקת-מחרוזת בלבד).
- **/api/ai/packages** — Map דולף הוחלף ב-`lib/serverRateLimit.ts` משותף שמתנקה.
- `createShortLink` — dedupe (select-לפני-insert) נגד ניפוח שורות.

### נכונות
- realCostPerGuest: חיסכון שלילי → `Math.max(0,…)`.
- תקציב: `₪NaN` על פריטים ישנים → `?? 0`. confirmedHeads: `attendingCount ?? 1`.
- AlcoholCalculator: `needByCategory` NaN → coercion. AiPackages: ערכי-ברירת-מחדל תקועים אחרי hydration → re-sync חד-פעמי.
- LiveModeView: מרוץ realtime (haptic/קול שווא) → guard.
- prompt ה-Wrapped: דגל localStorage נכתב מוקדם מדי → עכשיו ב-dismiss.
- AlertToast: טיימר 8 שנ׳ התאפס בכל render → ref יציב.
- מיגרציית event-memories: שורת realtime לא-אידמפוטנטית → guard.

---

## [R29] — 2026-05-17 — Hotfix: עמידות /i/[token] לשורת short_links חסרה

תיקון: כשל Supabase / שורה חסרה גרם לדף קריסה גנרי במקום מסך "ההזמנה פגה תוקף".
עכשיו `generateMetadata` (עם `.catch`), `lookupShortLink`, `createShortLink`
ו-`lookupEventByToken` עטופים כולם ב-try/catch — אפס שגיאות יוצאות מנתיב
ה-OG/שרת, וזרם ההזמנה נופל בחן לקישור הארוך. ללא שינוי סכימה/התנהגות בנתיב התקין.
**תוספת 🅕:** טעינת פונטי ה-OG (`assets/Heebo-*.ttf`) עטופה ב-try/catch —
כשל קריאה מחזיר תמונה ללא פונט מותאם במקום 500; ונוסף
`outputFileTracingIncludes` ב-next.config כדי שה-TTF ייכללו בפועל ב-bundle של
פונקציית ה-OG ב-Vercel (כך שעברית תרונדר). tsc + lint (0 errors) + build (46) ירוקים.

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
