# Operations Runbook — Momentum

**עודכן:** 10 במאי 2026

מדריך תפעול לאחרי launch. מה לעשות כשמשהו עובד, מה לעשות כשמשהו נופל, ואיך לבצע פעולות שגרתיות.

---

## פעולות שגרתיות

### יומיומי (5 דקות / יום)
1. בדוק WhatsApp + מייל להתראות בקשות ספקים חדשות
2. אם יש בקשה — לך ל-`/admin/vendors`, סקור, אשר/דחה
3. בדוק Vercel dashboard → Logs → אין שגיאות חמורות

### שבועי (15 דקות)
1. בדוק `vendor_applications` ב-Supabase — אם יש בקשות תקועות במצב `pending` יותר משבוע, סקור
2. בדוק Replicate billing → ראה כמה תמונות נוצרו השבוע, האם זה תואם למספר משתמשי premium
3. בדוק Resend dashboard → אחוז delivery, bounces
4. עשה גיבוי טרי: `cd ~/פרויקט\ ראשון/momentum && tar --exclude=node_modules --exclude=.next --exclude=.git -czf ~/Desktop/Momentum-מסמכים/04-גיבויים/גיבוי-$(date +%Y-%m-%d).tar.gz .`

### חודשי (30 דקות)
1. עדכן dependencies: `npm outdated` → `npm update` (לא major versions)
2. סקור באגים שנפתחו → תקן את הקריטיים
3. בדוק Supabase usage → אם מתקרב לרף, שדרג
4. סקור reviews של ספקים שאושרו → האם איכות הקטלוג נשמרת

---

## איך לאשר ספק

1. תקבל מייל / WhatsApp עם פרטי הבקשה
2. לך ל-`https://your-domain.com/admin/vendors`
3. התחבר עם המייל ב-`admin_emails`
4. תראה את הבקשה החדשה תחת "ממתינות לאישור"
5. בדוק:
   - **דוגמה לעבודה** — לחץ על הקישור, וודא שזה עסק לגיטימי
   - **ת.ז./מס' עוסק** — אם יש לך אפשרות, בדוק במאגרי רשם החברות
   - **שנים בתחום** — סבירות
   - **קישורים לרשתות** — האם פעילים, האם זה אותו עסק
6. החלט: **אשר** או **דחה** עם סיבה

⚠️ **אם אתה מאשר ספק premium או standard** — וודא שהוא הסכים לתשלום. בעתיד (Phase 2 עם Stripe), זה יקרה אוטומטית.

---

## איך להוסיף משתמש admin חדש

ב-Supabase SQL Editor:
```sql
insert into admin_emails (email) values ('new-admin@example.com');
```

המשתמש החדש חייב להירשם תחילה ב-app באותו מייל. אחרי זה, יוכל להיכנס ל-`/admin/vendors`.

---

## מעקב אחרי ביצועים

### Vercel Analytics
- דשבורד: https://vercel.com/[username]/momentum/analytics
- מה לעקוב: Page views, Top pages, Top countries, ערכי Core Web Vitals

### Supabase Database
- Dashboard → **Reports**
- מה לעקוב: API requests/day, Database connections, Storage size

### Replicate
- Dashboard → Usage
- מה לעקוב: Predictions/day, total cost

---

## איך לראות logs

### Vercel
```bash
vercel logs [url] --follow
```
או דרך Vercel dashboard → Deployments → לחץ על deployment → Functions → לחץ על function → Logs.

### Supabase
- Dashboard → **Logs Explorer**
- בחר filter: API / Auth / Database / Storage
- חפש לפי URL / status code / user_id

### Browser console (אצל המשתמש)
אין לך גישה — תבקש מהמשתמש לפתוח DevTools (F12) ולשלוח לך screenshot.

---

## כשמשהו נופל

### "Site is down"
1. בדוק https://www.vercel-status.com
2. אם Vercel up — בדוק Vercel logs לדומיין שלך
3. אם יש שגיאת build → לך ל-Deployments, ראה איזה deploy נכשל, גלגל אחורה ל-deployment קודם:
```bash
vercel rollback
```

### "Users report broken WhatsApp links"
1. בדוק `NEXT_PUBLIC_SITE_URL` ב-Vercel — האם נכון, האם יש redeploy אחריו
2. בדוק שה-URL בקישור מתחיל ב-`https://` (לא `/rsvp?...`)
3. אם הבעיה רק עם משתמש ספציפי — בקש את ה-URL המלא, פתח אותו אצלך

### "Admin dashboard is empty"
1. ה-RLS policy `user can read own admin row` חסר. ב-Supabase SQL Editor:
```sql
create policy "user can read own admin row" on admin_emails
  for select using (auth.jwt() ->> 'email' = email);
```
2. וודא שאתה מחובר עם המייל שב-`admin_emails`
3. בדוק עם `select auth.jwt() ->> 'email';` — אם NULL, אתה לא מחובר נכון

### "AI invitation generation fails"
1. בדוק `REPLICATE_API_TOKEN` ב-Vercel — תקף, לא פג
2. בדוק https://replicate.com/account/billing — האם יש credit
3. בדוק logs של `/api/invitation/generate`

### "Email notifications stopped"
1. בדוק Resend dashboard → Logs → ראה אם יש שגיאות
2. בדוק `RESEND_API_KEY` תקף
3. בדוק שלא הגעת ל-quota של 3000/חודש (free tier)

### "Supabase 500 errors"
1. בדוק Supabase dashboard → Health
2. בדוק ש-RLS policies לא חוסמות פעולה לגיטימית
3. בדוק שאין מיגרציה שלא הורצה

---

## גיבויים ושחזור

### גיבוי DB (Supabase)
- **אוטומטי**: Supabase עושה Daily backups ב-Pro plan ($25/חודש)
- **ידני**: Settings → Database → Backups → Create backup

### גיבוי קוד
- **אוטומטי**: כל push ל-Git
- **ידני**: tar של ה-folder
```bash
tar --exclude=node_modules --exclude=.next --exclude=.git -czf ~/Desktop/Momentum-מסמכים/04-גיבויים/גיבוי-$(date +%Y-%m-%d-%H%M).tar.gz .
```

### שחזור
- **DB**: Supabase dashboard → Database → Backups → Restore
- **קוד**: `git checkout <hash>` או חילוץ tar

---

## ניהול משתמשים

### צפה במשתמשים
ב-Supabase → **Authentication → Users**

### חסום משתמש
```sql
update auth.users set banned_until = now() + interval '100 years' where id = '<user_id>';
```

### מחק משתמש (GDPR)
ב-Supabase → Authentication → Users → לחץ על המשתמש → Delete user.
בדוק גם:
```sql
delete from events where user_id = '<user_id>';
delete from vendor_applications where email = '<user_email>';
-- וכו' לפי הקשר
```

---

## ניהול ספקים

### ספק רוצה לבטל את החשבון
1. ב-`/admin/vendors`, מצא את הספק
2. עדכן status ל-`cancelled`
3. השאר את הרשומה לצורכי היסטוריה

### ספק רוצה לעדכן פרטים
כיום (Phase 0): שלח לו טופס Google Form ידני. ב-Phase 1 יהיה לו portal עצמי.

### ספק שאישרת אבל הוא לא מופיע בקטלוג
זה ידוע — Phase 0 עוד לא דוחף אוטומטית לקטלוג. צריך:
1. עדכן ידנית את `lib/vendors.ts`
2. Commit + push
3. Vercel ידפלוי אוטומטית

(ב-Phase 1 זה יוחלף ב-Supabase table דינמי.)

---

## תקציב + הוצאות חודשיות

| שירות | עלות צפויה | מתי לשדרג |
|---|---|---|
| Vercel | חינם (Hobby) | אם יש 100K+ requests/חודש |
| Supabase | חינם | אם DB > 500MB או 50K+ MAU |
| Replicate | $0.06/לקוח premium/חודש | תמיד pay-as-you-go |
| Resend | חינם עד 3K/חודש | אם 1000+ ספקים נרשמים |
| CallMeBot | חינם | אם תרצה לשלוח לכמה אנשים |
| Domain | $10-15/שנה | פעם בשנה |
| **סה"כ pre-100 לקוחות** | ~$15/שנה | |

---

## אבטחה

### אם חושדים בפרצה
1. **מיד**: שנה את כל ה-API keys ב-Vercel + השתמש ב-`vercel --prod --force`
2. ב-Supabase: שנה את ה-DB password (Settings → Database)
3. בדוק logs לחיפוש שורש הבעיה
4. הודע למשתמשים אם נחשפו נתונים אישיים (חוק תיקון 13)

### אם API key דלף בטעות ל-git
```bash
git rm --cached .env.local
echo ".env.local" >> .gitignore
git commit -m "remove .env.local"
# שנה את ה-key מיד אחרי
```

### עדכוני אבטחה
חודשי:
```bash
npm audit
npm audit fix
```

---

## דברים שלא עושים (anti-patterns)

❌ אל תיתן API key של admin / service role לקוד client (NEXT_PUBLIC_*)
❌ אל תכתוב ישירות ל-localStorage מחוץ ל-`lib/store.ts` (ישבור sync)
❌ אל תוסיף שדה ל-state בלי migration (ישבור אצל משתמשים קיימים)
❌ אל תיגע ב-RLS policies בלי בדיקה — קל לפתוח חור אבטחה
❌ אל תעלה גירסה major של React/Next בלי בדיקה — שינויי breaking
❌ אל תאשר ספק שלא בדקת את הדוגמת עבודה שלו

---

## קונטקטים חיצוניים (שתשמור איפשהו בטוח)

- **Vercel support**: https://vercel.com/help
- **Supabase support**: support@supabase.io
- **Replicate**: support@replicate.com
- **Cloudflare** (אם domain שם): https://dash.cloudflare.com
- **עו"ד שלך** (להוסיף כשתבחר): ___
