import logoAsset from "@/assets/zaka-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function ZakaMark({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Logo Zaka"
      className={cn("size-9 object-contain", className)}
      loading="lazy"
    />
  );
}

export function ZakaLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ZakaMark className={markClassName} />
      <span className="font-display text-lg font-bold tracking-tight">
        Za<span className="text-primary">ka</span>
      </span>
    </span>
  );
}
