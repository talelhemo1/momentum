"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Share2,
  Download,
  Copy,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import {
  generateShareCard,
  blobToObjectUrl,
  downloadShareCard,
  TEMPLATE_LABELS,
  type CardTemplate,
} from "@/lib/eventCardGenerator";
import { showToast } from "@/components/Toast";
import type { EventInfo } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";

interface Props {
  event: EventInfo;
  /** Public RSVP / live URL the QR will point to. */
  qrTarget: string;
}

export function ShareEventCard({ event, qrTarget }: Props) {
  const [template, setTemplate] = useState<CardTemplate>("classic");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hold onto the latest blob so action buttons don't re-render the canvas.
  // useRef keeps it out of React's snapshot churn.
  const blobRef = useRef<Blob | null>(null);

  // Re-render the preview whenever the template, event, or qrTarget changes.
  // The async render is wrapped with a `cancelled` guard so a fast template
  // switch doesn't show a stale preview.
  useEffect(() => {
    let cancelled = false;
    let lastUrl: string | null = null;
    // setBusy(true) BEFORE the async kickoff would trip
    // `react-hooks/set-state-in-effect`. Schedule it on a microtask so it's
    // not "synchronously inside the effect body" — same effect for the user
    // but lint-clean.
    queueMicrotask(() => {
      if (!cancelled) setBusy(true);
    });
    generateShareCard({ event, template, qrTarget })
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        const url = blobToObjectUrl(blob);
        lastUrl = url;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch((err) => {
        console.error("[momentum/share-card] render failed", err);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      // If we created an object URL on this run but never made it to state,
      // free it now. The active URL is freed by the next render's setPreviewUrl.
      if (lastUrl && lastUrl !== previewUrl) URL.revokeObjectURL(lastUrl);
    };
    // We deliberately don't include previewUrl — its only role here is the URL
    // cleanup helper above; including it would cause a render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, template, qrTarget]);

  const onShare = async () => {
    if (!blobRef.current) return;
    const file = new File([blobRef.current], `momentum-share-${event.id.slice(0, 8)}.png`, {
      type: "image/png",
    });
    trackEvent("share_card_share", { eventId: event.id, template });
    const subjects = event.partnerName ? `${event.hostName} ו${event.partnerName}` : event.hostName;
    const text = `${subjects} מתכבדים להזמין אותך לאירוע שלהם 🎉\nאישור הגעה: ${qrTarget}`;
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], text, title: "הזמנה לאירוע" });
        return;
      } catch {
        // User cancelled or share blocked — fall through to WhatsApp link.
      }
    }
    // Fallback for desktops / browsers without Web Share Level 2.
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  };

  const onDownload = () => {
    if (!blobRef.current) return;
    downloadShareCard(blobRef.current, `momentum-story-${template}-${event.id.slice(0, 8)}.png`);
    trackEvent("share_card_download", { eventId: event.id, template });
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(qrTarget);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      trackEvent("share_card_copy_link", { eventId: event.id });
    } catch {
      showToast("העתקה נכשלה — סמן ידנית את הקישור", "error");
    }
  };

  return (
    <section className="card p-6 md:p-7 mt-6">
      <header>
        <span className="pill pill-gold">
          <Sparkles size={11} /> שיתוף האירוע
        </span>
        <h2 className="mt-2 text-xl md:text-2xl font-extrabold tracking-tight gradient-gold">
          📲 שתף את האירוע
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--foreground-soft)" }}>
          תצוגה מקדימה חיה. בחר תבנית, שמור לסטורי או שלח בוואטסאפ — הכרטיס נוצר על המכשיר שלך.
        </p>
      </header>

      <div className="mt-5 grid md:grid-cols-[280px_1fr] gap-5">
        {/* Live preview */}
        <div
          className="relative mx-auto md:mx-0 rounded-2xl overflow-hidden aspect-[9/16] w-full max-w-[280px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-gold)" }}
          aria-label="תצוגה מקדימה של כרטיס השיתוף"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="תצוגה מקדימה של כרטיס השיתוף"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: "var(--foreground-muted)" }}>
              <ImageIcon size={28} aria-hidden />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 size={28} className="animate-spin text-[--accent]" aria-hidden />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Template picker */}
          <fieldset>
            <legend className="block text-sm mb-2" style={{ color: "var(--foreground-soft)" }}>
              תבנית
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TEMPLATE_LABELS) as CardTemplate[]).map((t) => {
                const active = template === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTemplate(t)}
                    aria-pressed={active}
                    className="rounded-xl py-2.5 px-3 text-sm font-bold transition"
                    style={{
                      background: active ? "linear-gradient(135deg, #F4DEA9, #A8884A)" : "var(--input-bg)",
                      color: active ? "#1A1310" : "var(--foreground-soft)",
                      border: `1px solid ${active ? "var(--border-gold)" : "var(--border)"}`,
                    }}
                  >
                    {TEMPLATE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-1">
            <button
              type="button"
              onClick={onShare}
              disabled={busy || !previewUrl}
              className="btn-gold py-3 inline-flex items-center justify-center gap-2 disabled:opacity-40"
              aria-label="שתף את הכרטיס בוואטסאפ"
            >
              <Share2 size={16} />
              שתף ב-WhatsApp
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={busy || !previewUrl}
              className="btn-secondary py-3 inline-flex items-center justify-center gap-2 disabled:opacity-40"
              aria-label="הורד את הכרטיס לסיפור אינסטגרם"
            >
              <Download size={16} />
              הורד ל-Instagram Story
            </button>
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-2xl py-3 text-sm inline-flex items-center justify-center gap-2"
              style={{ border: "1px dashed var(--border-strong)", color: "var(--foreground-soft)" }}
              aria-label="העתק את קישור ההזמנה"
            >
              <Copy size={14} />
              {copied ? "הועתק ✓" : "העתק קישור הזמנה"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
