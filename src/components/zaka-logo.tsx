import logoAsset from "@/assets/zaka-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function ZakaMark({ className }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Logo Zaka"
      width={72}
      height={72}
      className={cn("size-8 shrink-0 object-contain sm:size-9", className)}
      decoding="async"
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
