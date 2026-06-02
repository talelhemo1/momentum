"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Sparkles } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { actions } from "@/lib/store";
import { showToast } from "@/components/Toast";
import type { EventInfo } from "@/lib/types";

/**
 * R159 — "your designed invitation".
 *
 * The owner asked that the couple be able to upload the invitation they
 * designed elsewhere, and have it appear in the link guests receive.
 * This card lives in the guests/send area: the host uploads an image,
 * it's stored in the public `invitations` Storage bucket, and its URL
 * is saved on the event. From there `encodeInvitation` embeds the URL
 * in every invite link and the RSVP page renders it as a banner above
 * the generated card. Degrades gracefully if Storage / the bucket
 * isn't reachable (clear toast, nothing else breaks).
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

function extFromType(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  if (fromName) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function InvitationDesignCard({ event }: { event: EventInfo }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const current = event.invitationImageUrl;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("בחרו קובץ תמונה (JPG / PNG / WebP).", "error");
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast("התמונה גדולה מדי (עד 8MB). כווצו ונסו שוב.", "error");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) {
        showToast("Supabase לא מוגדר.", "error");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showToast("צריך להתחבר כדי להעלות הזמנה.", "error");
        return;
      }
      const path = `${user.id}/invite-${event.id}-${Date.now()}.${extFromType(file)}`;
      const { error: uploadErr } = await supabase.storage
        .from("invitations")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) {
        console.error("[InvitationDesignCard] upload failed", uploadErr);
        showToast(
          "ההעלאה נכשלה. ודאו שהרצתם את מיגרציית ה-invitations ב-Supabase.",
          "error",
        );
        return;
      }
      const url = supabase.storage.from("invitations").getPublicUrl(path).data
        .publicUrl;
      actions.setEvent({ ...event, invitationImageUrl: url });
      showToast("✓ ההזמנה שלכם נשמרה ותופיע לכל המוזמנים", "success");
    } catch (e) {
      console.error("[InvitationDesignCard]", e);
      showToast("שגיאה בהעלאה.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    actions.setEvent({ ...event, invitationImageUrl: undefined });
    showToast("ההזמנה המעוצבת הוסרה", "info");
  };

  return (
    <div
      className="mt-4 card p-4"
      style={{ borderColor: "var(--border-gold)" }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: "var(--accent)" }} aria-hidden />
          <div>
            <h3 className="font-bold text-sm">ההזמנה המעוצבת שלכם</h3>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--foreground-muted)" }}
            >
              העלו את ההזמנה שעיצבתם — היא תופיע בראש הקישור שכל מוזמן מקבל.
            </p>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <ImagePlus size={16} aria-hidden />
            )}
            {busy ? "מעלה…" : current ? "החלפת הזמנה" : "העלאת הזמנה"}
          </button>
          {current && !busy && (
            <button
              type="button"
              onClick={remove}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full transition hover:bg-white/5"
              style={{ border: "1px solid var(--border)", color: "rgb(252,165,165)" }}
              aria-label="הסרת ההזמנה המעוצבת"
              title="הסרה"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {current && (
        <div
          className="mt-3 rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--border)", maxWidth: 260 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element --
              host-uploaded Storage image of unknown dimensions; a plain
              <img> preview is the right tool here. */}
          <img
            src={current}
            alt="ההזמנה המעוצבת שלכם"
            className="w-full h-auto block"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
