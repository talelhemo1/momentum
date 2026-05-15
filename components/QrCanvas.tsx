"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * R18 §I — tiny reusable QR renderer.
 *
 * Wraps `qrcode`'s `toDataURL` (same lib already used by event-day +
 * the card generator) so callers just pass a URL and get an <img>.
 * Renders nothing until the data URL resolves (no layout jump — the
 * box reserves its size).
 */
export function QrCanvas({
  value,
  size = 160,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: "#1A1310", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        /* Soft failure — caller still shows the copyable link. */
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        overflow: "hidden",
        background: "#FFFFFF",
      }}
      aria-hidden
    >
      {dataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="QR"
          width={size}
          height={size}
          style={{ display: "block" }}
        />
      )}
    </div>
  );
}
