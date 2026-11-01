import { cn } from "cn";

// The app icon (src/app/icon.svg), inline so it needs no request.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 512 512"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="512" height="512" rx="112" fill="#1e3a5f" />
      <g fill="#ffffff">
        <rect x="236" y="88" width="40" height="336" rx="20" />
        <path d="M256 196 L452 282 L452 318 L256 276 L60 318 L60 282 Z" />
        <path d="M256 364 L340 402 L340 428 L256 408 L172 428 L172 402 Z" />
      </g>
    </svg>
  );
}
