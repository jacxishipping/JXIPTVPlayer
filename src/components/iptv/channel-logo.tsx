"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { gradientFromString, monogram } from "@/lib/iptv/hooks";

interface ChannelLogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  name: string;
  src?: string;
  /** square size in px */
  size?: number;
  rounded?: "full" | "lg" | "md";
}

export function ChannelLogo({
  name,
  src,
  size = 48,
  rounded = "lg",
  className,
  alt,
  ...rest
}: ChannelLogoProps) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [c1, c2] = gradientFromString(name || "S");
  const radius =
    rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-xl" : "rounded-md";
  const initials = monogram(name || "?");

  const fallback = (
    <div
      className={`flex items-center justify-center font-bold text-white ${radius} ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        fontSize: size * 0.4,
      }}
      aria-label={alt ?? name}
      {...(rest as object)}
    >
      {initials}
    </div>
  );

  if (!src || errored) return fallback;

  return (
    <div
      className={`relative overflow-hidden ${radius} ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {!loaded && (
        <div className="absolute inset-0 shimmer" style={{ background: undefined }} />
      )}
      <img
        src={src}
        alt={alt ?? name}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className={`h-full w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{ background: "oklch(0.22 0.01 285)" }}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        {...rest}
      />
    </div>
  );
}
