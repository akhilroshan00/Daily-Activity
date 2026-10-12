"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function ScrollEntrance({ children }: { children: ReactNode }) {
  const overlay = useRef<HTMLDivElement>(null);
  const perspective = useRef<HTMLDivElement>(null); // Bug 2 fix: separate perspective parent
  const wrapper3d = useRef<HTMLDivElement>(null);   // this one gets rotateX
  const video = useRef<HTMLVideoElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const destination = useRef<HTMLDivElement>(null);
  const focusAfterEntrance = useRef(false);

  useEffect(() => {
    const overlayEl = overlay.current;
    const perspEl = perspective.current;
    const wrapEl = wrapper3d.current;
    const clip = video.current;
    const hintEl = hint.current;
    const app = destination.current;
    if (!overlayEl || !perspEl || !wrapEl || !clip || !app) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");

    // Bug 1 fix: set inert immediately (before reduced-motion check too)
    app.inert = true;

    // Reduced motion: skip straight to app
    if (reduced.matches) {
      overlayEl.style.display = "none";
      document.body.style.overflow = "";
      app.inert = false;
      return;
    }

    // Lock body scroll — app is always at scrollY 0
    document.body.style.overflow = "hidden";

    const TOTAL = 700;
    let accumulated = 0;
    let progress = 0;
    let frame = 0;
    let prev = 0;
    let done = false;

    /* ── Permanently dismiss overlay ── */
    const dismiss = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      frame = 0;
      overlayEl.style.transition = "opacity 0.4s ease";
      overlayEl.style.opacity = "0";
      setTimeout(() => {
        overlayEl.style.display = "none";
        document.body.style.overflow = "";
        app.inert = false;
        if (focusAfterEntrance.current) {
          app.focus({ preventScroll: true });
          focusAfterEntrance.current = false;
        }
      }, 420);
    };

    /* ── Seek video playhead to match progress ── */
    const seek = () => {
      if (clip.seeking || !Number.isFinite(clip.duration)) return;
      const t = Math.min(1, progress / 0.9) * Math.max(0, clip.duration - 0.05);
      if (Math.abs(clip.currentTime - t) > 0.02) clip.currentTime = t;
    };

    /* ── Animation tick ── */
    const tick = (now: number) => {
      if (done) return;
      const elapsed = Math.min(50, prev ? now - prev : 16);
      prev = now;

      const target = Math.min(1, accumulated / TOTAL);
      progress += (target - progress) * (1 - Math.exp(-elapsed / 90));
      if (Math.abs(target - progress) < 0.0002) progress = target;

      const p = progress;

      // Bug 2 fix: perspective on parent, rotateX on child
      perspEl.style.perspective = `${800 + p * 1000}px`;
      wrapEl.style.transform = `rotateX(${(1 - p) * 10}deg)`;
      wrapEl.style.borderRadius = `${Math.min(28, p * 52)}px`;
      // Bug 3 fix: box-shadow ring on wrapper (clips correctly after transform)
      wrapEl.style.boxShadow = `0 0 0 ${Math.min(80, p * 140)}px #000, 0 40px 120px #000a`;

      // Video scale: 1.3× zoomed-in → 1× natural (CSS var drives transform)
      clip.style.setProperty(
        "--entrance-video-scale",
        String(Math.max(1, 1.3 - p * 0.3)),
      );

      // Overlay fade: starts at 65% progress
      const fade = Math.min(1, Math.max(0, (p - 0.65) / 0.35));
      overlayEl.style.opacity = String(1 - fade * fade * (3 - 2 * fade));

      // Scroll hint: disappears in first 12%
      if (hintEl) {
        hintEl.style.opacity = String(Math.max(0, 1 - p / 0.12));
      }

      seek();

      if (progress >= 0.999 && target >= 0.999) {
        dismiss();
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    /* ── Wheel: forward scroll only ── */
    const onWheel = (e: WheelEvent) => {
      if (done) return;
      e.preventDefault();
      if (e.deltaY > 0) accumulated = Math.min(TOTAL, accumulated + e.deltaY);
      if (!frame) { prev = 0; frame = requestAnimationFrame(tick); }
    };

    /* ── Touch: swipe up only ── */
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      if (done) return;
      e.preventDefault();
      const delta = touchY - e.touches[0].clientY;
      touchY = e.touches[0].clientY;
      if (delta > 0) accumulated = Math.min(TOTAL, accumulated + delta * 2);
      if (!frame) { prev = 0; frame = requestAnimationFrame(tick); }
    };

    clip.addEventListener("loadeddata", () => clip.pause());
    clip.addEventListener("seeked", seek);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = "";
      app.inert = false;
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  function skip() {
    const overlayEl = overlay.current;
    const app = destination.current;
    if (!overlayEl || !app) return;
    overlayEl.style.transition = "opacity 0.3s ease";
    overlayEl.style.opacity = "0";
    setTimeout(() => { overlayEl.style.display = "none"; }, 320);
    document.body.style.overflow = "";
    app.inert = false;
    focusAfterEntrance.current = true;
    app.focus({ preventScroll: true });
  }

  return (
    <>
      {/* Fixed fullscreen overlay — NOT part of page scroll */}
      <div ref={overlay} className="entrance-overlay" aria-label="Loading entrance animation">
        {/* Bug 2 fix: perspective container wraps the 3D child */}
        <div className="entrance-perspective" ref={perspective}>
          <div className="entrance-3d" ref={wrapper3d}>
            <button className="entrance-skip" onClick={skip}>
              Skip animation and open app
            </button>
            <video
              ref={video}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              poster="/daylight-entrance-poster.jpg"
              src="/daylight-entrance.mp4"
            />
          </div>
        </div>

        {/* Scroll hint */}
        <div className="entrance-hint" ref={hint} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>scroll</span>
        </div>
      </div>

      {/* App — always at scroll 0, inert until entrance done */}
      {/* Bug 1 fix: visually hidden via CSS until JS unsets inert */}
      <div className="entrance-destination" ref={destination} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
