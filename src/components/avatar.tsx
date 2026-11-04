"use client";

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

// A member's picture, over their initials, which show until it loads and
// stay if it doesn't: no Gravatar, or no connection.  Decorative, as the
// name is always beside it or in a label.
export function Avatar({
  name,
  src,
  lazy = false,
  className,
}: {
  name: string;
  src?: string;
  // For long lists, loading only those scrolled to.
  lazy?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // An image that failed before the page was interactive fired its error
  // with no one listening.
  useEffect(() => {
    const img = image.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground select-none",
        className,
      )}
    >
      {initials(name) || "?"}
      {src && !failed && (
        // Not next/image: Gravatar sizes it, and there's nothing to
        // optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          src={src}
          alt=""
          loading={lazy ? "lazy" : undefined}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full bg-primary object-cover"
        />
      )}
    </span>
  );
}
