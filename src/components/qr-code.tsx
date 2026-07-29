import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

export function QrCode({
  value,
  size = 180,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: "#0b1220", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl border border-border bg-background p-3",
        className,
      )}
      style={{ width: size + 24, height: size + 24 }}
    >
      {src ? (
        <img src={src} alt="QR code" width={size} height={size} className="rounded-lg" />
      ) : (
        <span className="text-xs text-muted-foreground">QR…</span>
      )}
    </div>
  );
}
