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

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

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
        </div>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-5">
          <Section title="פרטי העסק">
            <Field label="שם העסק *" value={form.business_name} onChange={(v) => set("business_name", v)} />
            <Field label="איש קשר *" value={form.contact_name} onChange={(v) => set("contact_name", v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="טלפון *" value={form.phone} onChange={(v) => set("phone", v)} type="tel" placeholder="050-1234567" />
              <Field label="עיר" value={form.city} onChange={(v) => set("city", v)} />
            </div>
            <Field label="מייל *" value={form.email} onChange={(v) => set("email", v)} type="email" />
            <CategoryPicker value={form.category} onChange={(v) => set("category", v)} />
          </Section>

          <Section title="פרטים מקצועיים (לאימות)">
            <Field label="ת.ז. / מס' עוסק *" value={form.business_id} onChange={(v) => set("business_id", v)} placeholder="לזיהוי בלבד, לא מוצג ללקוחות" />
            <Field label="שנים בתחום *" value={form.years_in_field} onChange={(v) => set("years_in_field", v)} type="number" placeholder="0-80" />
            <Field label="קישור לדוגמת עבודה *" value={form.sample_work_url} onChange={(v) => set("sample_work_url", v)} placeholder="אינסטגרם, אתר, או דרייב" />
          </Section>

          <Section title="פרופיל ציבורי">
            <Textarea label="אודות (יוצג ללקוחות)" value={form.about} onChange={(v) => set("about", v)} maxLength={1500} />
            <Field label="אתר" value={form.website} onChange={(v) => set("website", v)} placeholder="https://..." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="אינסטגרם" value={form.instagram} onChange={(v) => set("instagram", v)} placeholder="@username" />
              <Field label="פייסבוק" value={form.facebook} onChange={(v) => set("facebook", v)} placeholder="username" />
            </div>
          </Section>

          <button
            type="submit"
            disabled={submitting}
            className="btn-gold w-full inline-flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
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
