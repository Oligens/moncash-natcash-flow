import { cn } from "@/lib/utils";

export function ZakaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      alt="Logo Zaka"
      className={cn("size-8 shrink-0 sm:size-9", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="zakaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="36" r="34" fill="url(#zakaGrad)" />
      <path
        d="M24 36l8 12 16-24"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
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
