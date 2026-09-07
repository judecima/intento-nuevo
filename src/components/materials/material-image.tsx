"use client";

import { useState } from "react";
import Image from "next/image";

type MaterialImageProps = {
  src: string | null;
  alt: string;
};

export function MaterialImage({ src, alt }: MaterialImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--md-surface-container)] text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Sin imagen
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(min-width: 1024px) 180px, (min-width: 768px) 25vw, 50vw"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
