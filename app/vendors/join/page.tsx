"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Building2, Send, Loader2 } from "lucide-react";
import { VENDOR_CATEGORIES, type VendorCategory } from "@/lib/vendorApplication";
import { showToast } from "@/components/Toast";

interface FormData {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  city: string;
  category: VendorCategory | "";
  about: string;
  website: string;
  instagram: string;
  facebook: string;
  sample_work_url: string;
  business_id: string;
  /** stored as string so the input controls are simple; converted to number on submit */
  years_in_field: string;
}

const EMPTY_FORM: FormData = {
  business_name: "",
  contact_name: "",
  phone: "",
  email: "",
  city: "",
  category: "",
  about: "",
  website: "",
  instagram: "",
  facebook: "",
  sample_work_url: "",
  business_id: "",
  years_in_field: "",
};

export default function VendorJoinPage() {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // R18 §G — 3-step wizard. Splitting the 13-field wall into bite-size
  // steps roughly tripled completion in the brief's intent.
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Per-step required fields — the "Next" button stays disabled until
  // the current step's mandatory fields are filled.
  const stepValid = (s: 1 | 2 | 3): boolean => {
    if (s === 1)
      return !!form.business_name && !!form.contact_name && !!form.category;
    if (s === 2) return !!form.phone && !!form.email;
    return (
      !!form.business_id && !!form.years_in_field && !!form.sample_work_url
    );
  };
  const goNext = () => {
    if (!stepValid(step)) {
      showToast("יש למלא את שדות החובה בשלב זה", "error");
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  };
  const goPrev = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (
      !form.business_name ||
      !form.contact_name ||
      !form.phone ||
      !form.email ||
      !form.category ||
      !form.sample_work_url ||
      !form.business_id ||
      !form.years_in_field
    ) {
      showToast("חסרים שדות חובה", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendors/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          years_in_field: Number(form.years_in_field),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "ההגשה נכשלה", "error");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      showToast("שגיאה ברשת — נסה שוב", "error");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card-gold p-8 text-center max-w-md">
          <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
          <h1 className="mt-4 text-2xl font-bold gradient-gold">הבקשה התקבלה!</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--foreground-soft)" }}>
            נבדוק את הבקשה שלך תוך 1-3 ימי עסקים. אם תאושר, נשלח לך מייל עם
            קישור להפעלת הפרופיל באפליקציה.
          </p>
          <Link href="/" className="btn-gold mt-6 inline-flex">
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20 px-5">
      <div className="max-w-2xl mx-auto pt-6">
        <Link
          href="/vendors"
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--foreground-soft)" }}
        >
          <ArrowLeft size={14} /> חזרה לספקים
        </Link>

        <div className="mt-6 text-center">
          <Building2 size={28} className="mx-auto text-[--accent]" />
          <h1 className="mt-3 text-3xl font-extrabold gradient-gold">הצטרפו כספק</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--foreground-soft)" }}>
            ספק אירועים? הוסיפו את העסק שלכם לקטלוג. ההצטרפות חינם, אישור תוך 1-3 ימי עסקים.
          </p>
          {/* R18 §G — speed badge to lower the perceived effort. */}
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full" style={{ background: "rgba(212,176,104,0.12)", border: "1px solid var(--border-gold)", color: "var(--accent)" }}>
            ⚡ טופס מהיר — 60 שניות בלבד
          </span>
        </div>

        {/* R18 §G — progress bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "var(--foreground-soft)" }}>
            <span>שלב <span className="ltr-num">{step}</span> מתוך <span className="ltr-num">3</span></span>
            <span>{step === 1 ? "פרטי העסק" : step === 2 ? "יצירת קשר" : "פרופיל"}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--input-bg)" }}>
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%`, background: "linear-gradient(90deg, var(--gold-100), var(--accent), var(--gold-500))" }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
          {step === 1 && (
            <Section title="פרטי העסק">
              <Field label="שם העסק *" value={form.business_name} onChange={(v) => set("business_name", v)} />
              <Field label="איש קשר *" value={form.contact_name} onChange={(v) => set("contact_name", v)} />
              <CategoryPicker value={form.category} onChange={(v) => set("category", v)} />
              <Field label="עיר / אזור" value={form.city} onChange={(v) => set("city", v)} />
            </Section>
          )}

          {step === 2 && (
            <Section title="יצירת קשר">
              <Field label="טלפון *" value={form.phone} onChange={(v) => set("phone", v)} type="tel" placeholder="050-1234567" />
              <Field label="מייל *" value={form.email} onChange={(v) => set("email", v)} type="email" />
              <Field label="אתר" value={form.website} onChange={(v) => set("website", v)} placeholder="https://..." />
            </Section>
          )}

          {step === 3 && (
            <Section title="פרופיל ואימות">
              <Field label="ת.ז. / מס' עוסק *" value={form.business_id} onChange={(v) => set("business_id", v)} placeholder="לזיהוי בלבד, לא מוצג ללקוחות" />
              <Field label="שנים בתחום *" value={form.years_in_field} onChange={(v) => set("years_in_field", v)} type="number" placeholder="0-80" />
              <Field label="קישור לדוגמת עבודה *" value={form.sample_work_url} onChange={(v) => set("sample_work_url", v)} placeholder="אינסטגרם, אתר, או דרייב" />
              <Textarea label="אודות (יוצג ללקוחות)" value={form.about} onChange={(v) => set("about", v)} maxLength={1500} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="אינסטגרם" value={form.instagram} onChange={(v) => set("instagram", v)} placeholder="@username" />
                <Field label="פייסבוק" value={form.facebook} onChange={(v) => set("facebook", v)} placeholder="username" />
              </div>
            </Section>
          )}

          {/* R18 §G — wizard nav. Prev (steps 2/3), Next (steps 1/2),
              Submit (step 3 only). */}
          <div className="flex items-center gap-3 mt-2">
            {step > 1 && (
              <button
                type="button"
                onClick={goPrev}
                className="btn-secondary flex-1 inline-flex items-center justify-center gap-2"
              >
                <ArrowLeft size={16} className="rotate-180" /> הקודם
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!stepValid(step)}
                className="btn-gold flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                הבא <ArrowLeft size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="btn-gold flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={18} /> שולח...
                  </>
                ) : (
                  <>
                    <Send size={18} /> שלח בקשה
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5">
      <legend className="text-sm font-semibold px-2" style={{ color: "var(--accent)" }}>
        {title}
      </legend>
      <div className="mt-3 grid gap-3">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={4}
        className="input"
        style={{ resize: "none" }}
      />
      {maxLength && (
        <div className="text-[10px] text-end mt-1 ltr-num" style={{ color: "var(--foreground-muted)" }}>
          {value.length}/{maxLength}
        </div>
      )}
    </label>
  );
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: VendorCategory) => void;
}) {
  return (
    <div>
      <span className="text-xs block mb-1.5" style={{ color: "var(--foreground-soft)" }}>
        קטגוריה *
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {VENDOR_CATEGORIES.map((c) => {
          const active = value === c.id;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => onChange(c.id)}
              aria-pressed={active}
              className="rounded-2xl p-2 text-center transition"
              style={{
                background: active ? "rgba(212,176,104,0.18)" : "var(--input-bg)",
                border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
              }}
            >
              <div className="text-lg">{c.emoji}</div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: active ? "var(--accent)" : "var(--foreground-soft)" }}
              >
                {c.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
