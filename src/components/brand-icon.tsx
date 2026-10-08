import type { CSSProperties } from "react";

/** The supplied book/check mark, shared by every branding placement. */
export default function BrandIcon({
  size = 24,
  animated = false,
}: {
  size?: number;
  animated?: boolean;
}) {
  return (
    <span
      className={`brand-icon${animated ? " brand-icon-animated" : ""}`}
      style={{ "--brand-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export function BrandMotion() {
  return (
    <div className="brand-motion" aria-hidden="true">
      <div className="brand-motion-halo" />
      <div className="brand-motion-emblem">
        <BrandIcon size={164} />
      </div>
      <div className="brand-motion-shadow" />
      <span className="brand-motion-caption">LEARN. DO. GROW.</span>
    </div>
  );
}
