"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Eye, AlertCircle } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import type { VendorLandingData } from "@/lib/types";
import { VendorLandingClient } from "@/components/vendor-studio/VendorLandingClient";

/**
 * Owner-preview route — `/vendor/<slug>/preview`.
 *
 * Lets a vendor see how their landing will look BEFORE flipping the
 * "published" toggle. Auth-gated to the row's owner so unpublished
 * drafts stay private. Uses the user's session (RLS lets the owner read
 * their own row regardless of landing_published).
 */
export default function VendorLandingPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";

  const [vendor, setVendor] = useState<VendorLandingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Supabase לא מוגדר");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const client = createClient(url, key);
      const { data: { user } } = await client.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace(`/signup?returnTo=/vendor/${slug}/preview`);
        return;
      }
      // RLS policy "owner reads own landing" lets us see unpublished rows
      // when auth.uid() = owner_user_id. We pass the user's token by
      // re-creating the client with it set in the global headers.
      const authedClient = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${user.id}` } },
      });
      const { data } = (await authedClient
        .from("vendor_landings")
        .select("*")
        .eq("slug", slug)
        .eq("owner_user_id", user.id)
        .maybeSingle()) as { data: VendorLandingData | null };
      if (cancelled) return;
      if (!data) {
        setError("הדף לא נמצא או שאינו שייך אליך");
        setLoading(false);
        return;
      }
      setVendor(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[--accent]" size={32} aria-hidden />
      </main>
    );
  }

  if (error || !vendor) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 text-center max-w-md">
          <AlertCircle size={32} className="mx-auto text-amber-400" aria-hidden />
          <p className="font-semibold mt-3">{error ?? "הדף לא נמצא"}</p>
          <Link
            href="/dashboard/vendor-studio"
            className="text-xs underline mt-4 inline-block"
            style={{ color: "var(--foreground-muted)" }}
          >
            חזרה לעורך
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Preview banner — sticky strip at the top so the owner always
          knows they're looking at the draft, not the published version. */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between gap-3 px-5 py-2 text-xs backdrop-blur-md"
        style={{
          background: vendor.landing_published
            ? "rgba(52,211,153,0.12)"
            : "rgba(251,191,36,0.12)",
          borderBottom: `1px solid ${
            vendor.landing_published
              ? "rgba(52,211,153,0.3)"
              : "rgba(251,191,36,0.3)"
          }`,
        }}
      >
        <div className="inline-flex items-center gap-2 font-semibold">
          <Eye size={14} aria-hidden />
          {vendor.landing_published
            ? "תצוגה מקדימה — הדף מפורסם"
            : "תצוגה מקדימה — הדף לא פורסם עדיין"}
        </div>
        <Link
          href="/dashboard/vendor-studio"
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--border)",
          }}
        >
          חזרה לעורך
        </Link>
      </div>
      <VendorLandingClient vendor={vendor} />
    </>
  );
}
