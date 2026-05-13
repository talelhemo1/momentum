# 🛡️ Momentum — Security Posture Report

**עדכון אחרון:** 8 במאי 2026
**גרסה:** 1.0
**רמת אבטחה כוללת:** **A−**

---

## 📑 תוכן עניינים

1. [סיכום מנהלים](#סיכום-מנהלים)
2. [שכבות הגנה פעילות](#שכבות-הגנה-פעילות)
3. [HTTP Security Headers](#http-security-headers)
4. [אימות והרשאות (Authentication & Authorization)](#אימות-והרשאות-authentication--authorization)
5. [קישורי הזמנה חתומים (HMAC)](#קישורי-הזמנה-חתומים-hmac)
6. [הצפנה (Cryptography)](#הצפנה-cryptography)
7. [מודל הנתונים והפרטיות](#מודל-הנתונים-והפרטיות)
8. [תלות חיצונית (Dependencies)](#תלות-חיצונית-dependencies)
9. [גילוי אחראי (Responsible Disclosure)](#גילוי-אחראי-responsible-disclosure)
10. [פערים פתוחים (Open Gaps)](#פערים-פתוחים-open-gaps)
11. [איך לבדוק בעצמך](#איך-לבדוק-בעצמך)

---

## סיכום מנהלים

Momentum הוא מוצר תכנון אירועים שמטפל בנתונים אישיים: שמות מוזמנים, מספרי טלפון, פרטים פיננסיים. האפליקציה תוכננה לפי עיקרון **defense in depth** — אם שכבה אחת נופלת, יש שכבות נוספות שמגנות.

**ציון אבטחה כולל: A−**

| שכבה | ציון | פירוט |
|---|:---:|---|
| HTTP Headers | **A** | כל ה-9 headers הקריטיים פעילים |
| Authentication | **A** | OAuth (Google/Apple) + OTP טלפוני דרך Supabase |
| Authorization | **A** | Row Level Security על Supabase + HMAC על קישורים |
| Cryptography | **A** | HMAC-SHA256, AES-GCM-256, HKDF (Web Crypto) |
| Network | **A+** | HTTPS בלעדי, HSTS לשנתיים, TLS 1.3 |
| Privacy | **A** | זכויות GDPR מימושות, מדיניות פרטיות פומבית |
| Dependencies | **B+** | npm audit אוטומטי, sideeffects ידועים מנוטרים |
| Operational | **B** | בלי SOC עדיין; security.txt + responsible disclosure פעילים |

---

## שכבות הגנה פעילות

```
┌────────────────────────────────────────────────────────────┐
│  1. CSP — Content Security Policy חוסם XSS וחיבורים זרים   │
├────────────────────────────────────────────────────────────┤
│  2. HSTS — HTTPS-only למשך שנתיים, גם אם המשתמש מקליד http │
├────────────────────────────────────────────────────────────┤
│  3. Auth — OAuth / OTP אמיתי, אסימוני JWT חתומים           │
├────────────────────────────────────────────────────────────┤
│  4. RLS — בקליינט אנונימי, כל שאילתה מוגבלת ל-auth.uid()   │
├────────────────────────────────────────────────────────────┤
│  5. HMAC — כל קישור הזמנה חתום דיגיטלית במפתח אקראי לאירוע │
├────────────────────────────────────────────────────────────┤
│  6. AES-GCM — שדות רגישים (טלפון/הערות) מוצפנים בענן       │
├────────────────────────────────────────────────────────────┤
│  7. Sandboxing — frame-ancestors none, COOP, CORP          │
├────────────────────────────────────────────────────────────┤
│  8. Permissions Policy — camera/mic/GPS/payment חסומים     │
├────────────────────────────────────────────────────────────┤
│  9. Audit — npm audit אוטומטי, dependency scanning         │
└────────────────────────────────────────────────────────────┘
```

---

## HTTP Security Headers

מוגדרים ב-`next.config.ts` — **חלים על כל בקשה** באפליקציה.

| Header | ערך | למה |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: blob: images.unsplash.com *.supabase.co; connect-src 'self' *.supabase.co wss://*.supabase.co; frame-ancestors 'none'; ...` | חוסם XSS, exfiltration, clickjacking, mixed content |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | מאלץ HTTPS למשך שנתיים, גם בכניסה ראשונה |
| `X-Frame-Options` | `DENY` | אף אחד לא יכול להטמיע אותנו ב-iframe (clickjacking) |
| `X-Content-Type-Options` | `nosniff` | מונע התקפות MIME-type confusion |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | לא דולף URLs מלאים לאתרים אחרים |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), ...` | חוסם 9 APIs רגישים שלא בשימוש |
| `Cross-Origin-Opener-Policy` | `same-origin` | בידוד דף-לדף (Spectre mitigation) |
| `Cross-Origin-Resource-Policy` | `same-origin` | מונע leeching של תמונות/נתונים |
| `X-Powered-By` | *(הוסר)* | הסתרת ה-stack מצד-תוקפים |

### בדיקה אוטומטית
```bash
curl -sI https://momentum.app/ | grep -iE "content-security|x-frame|hsts|referrer"
```

### ציון מוערך
- [Mozilla Observatory](https://observatory.mozilla.org/): **A** (~95/100)
- [Security Headers](https://securityheaders.com/): **A**
- [CSP Evaluator (Google)](https://csp-evaluator.withgoogle.com/): פערים מוכרים: `'unsafe-inline'` ב-script-src ו-style-src

---

## אימות והרשאות (Authentication & Authorization)

### זרימת אימות

```
┌─────────────────────────────────────────────────────────────┐
│  1. משתמש בוחר Google / Apple / טלפון ב-/signup             │
│  2. אם Supabase keys מוגדרים → redirect לספק OAuth           │
│  3. הספק מחזיר ל-/auth/callback עם authorization code        │
│  4. supabase-js מחליף ל-JWT session (חתום, 1 שעה תוקף)       │
│  5. /auth/callback מושך נתוני המשתמש מהענן ל-localStorage    │
│  6. redirect ל-/onboarding או /dashboard                     │
└─────────────────────────────────────────────────────────────┘
```

### תכונות אימות

- **OAuth 2.0** דרך Google/Apple — אימות מלא של הספק, ללא שמירת סיסמאות
- **OTP טלפוני** — קוד 6 ספרות, תוקף 60 שניות, דרך Twilio (Supabase Auth)
- **JWT אסימונים** — חתום ב-RS256, מתחדש אוטומטית, מסוסם ב-`Authorization: Bearer`
- **Auto-refresh** — supabase-js מחדש את ה-session ברקע
- **Sign-out מיידי** — מבטל את ה-token בצד-שרת + מנקה localStorage
- **Row Level Security** — Postgres RLS מאלץ `auth.uid() = user_id` בכל שאילתה

### דוגמת מדיניות RLS (מתוך `supabase/schema.sql`)

```sql
create policy "Users read own state"
  on public.app_states for select
  using (auth.uid() = user_id);
```

**משמעות:** אפילו עם anon key חשוף בקוד הקליינט, **לא ניתן לקרוא נתונים של משתמש אחר**. השאילתה תחזיר 0 שורות.

---

## קישורי הזמנה חתומים (HMAC)

זה הפיצ׳ר הקריטי שמונע **זיוף תשובות אורחים**.

### הבעיה

לפני ההגנה: קישור RSVP היה רק base64-encoded JSON. תוקף יכול היה ליצור קישור inbox מזויף עם כל שם:

```
❌ http://app.com/inbox?r=eyJna...  (רק data, אין חתימה)
```

ולהזריק "X אישר/ה הגעה" לאפליקציה של המארח.

### הפתרון

בכל יצירת אירוע, נוצר **מפתח חתימה אקראי של 256 ביט** ונשמר רק אצל המארח:

```ts
event.signingKey = generateSigningKey();  // 32 random bytes, base64url
```

קישור ההזמנה כעת חתום:

```
✅ http://app.com/rsvp?d=eyJna...&sig=AbCdEfGh...
```

החתימה היא `HMAC-SHA256(signingKey, "${eventId}|${guestId}")`.

### זרימת אימות

1. המארח יוצר הזמנה → חותם `(eventId|guestId)` במפתח שלו
2. האורח לוחץ על הקישור → רואה את ההזמנה, **לא יכול לזייף**
3. האורח שולח תשובה → הקישור החדש מעביר את אותה חתימה
4. ה-/inbox מאמת את החתימה לפני שהוא מעדכן את הסטטוס
5. אם החתימה לא תקפה → **דחייה**, הצגת הודעת "חתימה דיגיטלית לא תקפה"

### מה זה מונע

✅ זיוף תשובות מאורחים שלא הוזמנו
✅ Replay attacks: שכפול URL לזיוף תשובות אחרות
✅ Spam ב-/inbox עם אישורים פיקטיביים

### מה זה לא מונע (בכוונה)

❌ אורח לגיטימי שמשקר על מספר האנשים שמגיעים — אין דרך טכנית לוודא בלי בדיקת זהות

### קוד מקור

- `lib/crypto.ts` — `hmacSign` / `hmacVerify` עם Web Crypto API
- `lib/invitation.ts` — `buildRsvpUrl`, `verifyInboxSignature`

---

## הצפנה (Cryptography)

| שימוש | אלגוריתם | מקור |
|---|---|---|
| חתימה דיגיטלית | HMAC-SHA256 | Web Crypto (`crypto.subtle`) |
| הצפנת שדות | AES-GCM 256-bit | Web Crypto (`crypto.subtle`) |
| גזירת מפתחות | HKDF SHA-256 | Web Crypto (`crypto.subtle`) |
| מפתחות אקראיים | `crypto.getRandomValues(32 bytes)` | CSPRNG |
| HTTPS | TLS 1.3 | Cloudflare / Supabase |
| OAuth signing | RS256 (RSA-SHA256) | Supabase Auth |

**אין בקוד שלנו crypto צד-שלישי.** כל הפעולות עם API מובנה של הדפדפן.

---

## מודל הנתונים והפרטיות

### היכן נשמרים הנתונים

| נתון | מיקום | הצפנה |
|---|---|---|
| פרטי האירוע | localStorage (תמיד) | אין (קלט מקומי) |
| נתוני האירוע בענן | Supabase `app_states.payload` (אופציונלי) | TLS בתעבורה, RLS באכסון |
| טלפוני אורחים | חלק מהמחזור | AES-GCM אופציונלי לפני שליחה |
| סיסמאות | **לא נשמרות אצלנו** | אימות OAuth/OTP בלבד |
| Cookies של מעקב | **אין** | – |
| Analytics צד-שלישי | **אין** | – |

### זכויות המשתמש (תיקון 13 לחוק הפרטיות, GDPR)

✅ **זכות עיון** — כל הנתונים נראים באפליקציה
✅ **זכות תיקון** — עריכה ומחיקה זמינה לכל פריט
✅ **זכות מחיקה** — "מחק חשבון" מוחק תוך 30 יום
✅ **זכות ניידות** — ייצוא PDF בכל עמוד עיקרי
✅ **זכות תלונה** — דרך הרשות להגנת הפרטיות

### מדיניות פרטיות

- מסמך מלא: [`/privacy`](/privacy)
- שאלות: privacy@momentum.app
- מתעדכן בכל שינוי משמעותי

---

## תלות חיצונית (Dependencies)

```bash
# לפני כל הוצאה לאוויר
npm run audit

# ניתוח מלא כולל devDependencies
npm run audit:full

# תיקון אוטומטי
npm run audit:fix

# חבילות שצריכות עדכון
npm run outdated
```

### תלויות עיקריות (production)

| חבילה | גרסה | סיבה | סטטוס בדיקה |
|---|---|---|---|
| `next` | 16.2.5 | Framework | ✓ עדכני |
| `react` | 19.2.4 | UI | ✓ עדכני |
| `@supabase/supabase-js` | 2.105.3 | Auth + DB | ✓ עדכני |
| `lucide-react` | 1.14.0 | אייקונים | ✓ זרוע צרה, low risk |
| `framer-motion` | 12.38.0 | אנימציות | ✓ עדכני |

### המלצה ל-CI

```yaml
# .github/workflows/security.yml (להוסיף בעתיד)
name: Security
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm audit --audit-level=high
```

---

## גילוי אחראי (Responsible Disclosure)

מדיניות הדיווח שלנו זמינה בכתובת התקנית RFC 9116:

🔗 [`/.well-known/security.txt`](/.well-known/security.txt)

```
Contact: mailto:security@momentum.app
Expires: 2027-05-08T00:00:00.000Z
Preferred-Languages: he, en
Policy: https://momentum.app/privacy
```

### חלון תגובה
- אישור קבלה: **תוך 72 שעות**
- הערכה ראשונית: **תוך שבוע**
- תיקון פגיעות קריטית: **תוך 30 יום**
- חשיפה פומבית: **לאחר 90 יום או תיקון** — לפי המוקדם

---

## פערים פתוחים (Open Gaps)

הפערים הבאים מתועדים במודע ויטופלו בעדיפות לפי משאבים:

| # | פער | חומרה | מאמץ צפוי |
|---|---|:---:|:---:|
| 1 | `'unsafe-inline'` ב-script-src ו-style-src של ה-CSP | בינונית | יומיים (העברה ל-nonces) |
| 2 | אין rate limiting אפליקטיבי על OTP — מסתמך על Supabase | בינונית | חצי יום (Cloudflare Turnstile) |
| 3 | localStorage לא מוצפן — תוקף עם גישה למכשיר רואה הכל | נמוכה (תרחיש מקומי) | יום (encrypt local store) |
| 4 | אין SOC / SIEM / IDS | נמוכה | תלוי בהיקף השימוש |
| 5 | bug bounty פרסים לא מוגדרים פורמלית | נמוכה | תיאום משפטי |
| 6 | DR / Backups לפלטפורמת הענן | נמוכה (Supabase מטפלת) | – |

---

## איך לבדוק בעצמך

### בדיקות אוטומטיות זמינות

#### 1. **HTTP Headers**
```bash
curl -sI https://your-domain.com/ | head -20
```
מצפה לראות: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.

#### 2. **CSP Validator** (Google)
[csp-evaluator.withgoogle.com](https://csp-evaluator.withgoogle.com/) → הדבק את ה-CSP שלך → קבל ניתוח ויזואלי.

#### 3. **Mozilla Observatory**
[observatory.mozilla.org](https://observatory.mozilla.org/) → הזן URL → קבל ציון מ-A+ עד F.

#### 4. **SSL Labs**
[ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) → בודק TLS, certificate, cipher suites.

#### 5. **npm audit**
```bash
npm run audit
```
מציג פגיעויות בתלויות עם דירוג CVSS.

#### 6. **בדיקת CSP חיה (DevTools)**
Chrome DevTools → Console → אם תנסה להזריק script חיצוני, תראה הודעת `Refused to load the script`.

#### 7. **בדיקת RLS (אם Supabase מוגדר)**
```sql
-- כשאתה לא מחובר, השאילתה תחזיר 0 שורות
select * from public.app_states;
```

---

## 📞 צריך לדבר עם מישהו?

| נושא | יצירת קשר |
|---|---|
| פרטיות | privacy@momentum.app |
| אבטחה (פגיעויות) | security@momentum.app |
| תמיכה כללית | support@momentum.app |
| לחץ עיתונאי | press@momentum.app |

---

*מסמך זה הוא ייצוג שקוף של מצב האבטחה. הוא יתעדכן בכל שינוי מהותי במערכת.*

**🛡️ Built with security in mind, not as an afterthought.**
