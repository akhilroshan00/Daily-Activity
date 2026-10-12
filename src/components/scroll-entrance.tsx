"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function ScrollEntrance({ children }: { children: ReactNode }) {
  const overlay = useRef<HTMLDivElement>(null);
  const wrapper3d = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const destination = useRef<HTMLDivElement>(null);
  const focusAfterEntrance = useRef(false);

  useEffect(() => {
    const overlayEl = overlay.current;
    const wrapEl = wrapper3d.current;
    const clip = video.current;
    const hintEl = hint.current;
    const app = destination.current;
    if (!overlayEl || !wrapEl || !clip || !app) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");

    // Reduced motion: skip straight to app
    if (reduced.matches) {
      overlayEl.style.display = "none";
      document.body.style.overflow = "";
      app.inert = false;
      return;
    }

    // Lock body scroll — app sits at scroll 0 the whole time
    document.body.style.overflow = "hidden";
    app.inert = true;

    const TOTAL = 700; // total wheel px to complete entrance
    let accumulated = 0;
    let progress = 0;
    let frame = 0;
    let prev = 0;
    let done = false;

    /* ── Permanently dismiss the overlay ── */
    const dismiss = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      frame = 0;
      // Fade out then remove
      overlayEl.style.transition = "opacity 0.35s ease";
      overlayEl.style.opacity = "0";
      setTimeout(() => {
        overlayEl.style.display = "none";
        document.body.style.overflow = "";
        app.inert = false;
        if (focusAfterEntrance.current) {
          app.focus({ preventScroll: true });
          focusAfterEntrance.current = false;
        }
      }, 360);
    };

    /* ── Seek video to match progress ── */
    const seek = () => {
      if (clip.seeking || !Number.isFinite(clip.duration)) return;
      const t =
        Math.min(1, progress / 0.9) * Math.max(0, clip.duration - 0.05);
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

      // 3D perspective zoom-out
      wrapEl.style.perspective = `${800 + p * 1000}px`;
      wrapEl.style.transform = `rotateX(${(1 - p) * 12}deg)`;
      wrapEl.style.borderRadius = `${Math.min(28, p * 52)}px`;
      wrapEl.style.boxShadow = `0 0 0 ${Math.min(60, p * 110)}px #000, 0 40px 120px #0008`;

      // Video scale: zoomed-in → natural
      clip.style.setProperty(
        "--entrance-video-scale",
        String(Math.max(1, 1.35 - p * 0.35)),
      );

      // Fade overlay from 62% progress onwards
      const fade = Math.min(1, Math.max(0, (p - 0.62) / 0.38));
      overlayEl.style.opacity = String(1 - fade * fade * (3 - 2 * fade));

      // Scroll hint vanishes in first 15%
      if (hintEl) {
        hintEl.style.opacity = String(Math.max(0, 1 - p / 0.15));
      }

      seek();

      if (progress >= 0.999 && target >= 0.999) {
        dismiss();
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    /* ── Wheel: accumulate forward scroll only ── */
    const onWheel = (e: WheelEvent) => {
      if (done) return;
      e.preventDefault();
      // Only forward (down) scrolls progress the entrance; ignore upward
      if (e.deltaY > 0) {
        accumulated = Math.min(TOTAL, accumulated + e.deltaY);
      }
      if (!frame) { prev = 0; frame = requestAnimationFrame(tick); }
    };

    /* ── Touch: forward swipe-up only ── */
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (done) return;
      e.preventDefault();
      const delta = touchStartY - e.touches[0].clientY; // positive = swiping up
      touchStartY = e.touches[0].clientY;
      if (delta > 0) {
        accumulated = Math.min(TOTAL, accumulated + delta * 2);
      }
      if (!frame) { prev = 0; frame = requestAnimationFrame(tick); }
    };

    clip.addEventListener("loadeddata", () => clip.pause());
    clip.addEventListener("seeked", seek);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });

    // Kick off first frame
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
    overlayEl.style.display = "none";
    document.body.style.overflow = "";
    app.inert = false;
    focusAfterEntrance.current = true;
    app.focus({ preventScroll: true });
  }

  return (
    <>
      {/* Fixed fullscreen overlay — NOT part of scroll flow */}
      <div ref={overlay} className="entrance-overlay">
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
        {/* Scroll hint */}
        <div className="entrance-hint" ref={hint} aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>scroll</span>
        </div>
      </div>

      {/* App — always at scroll position 0, inert until entrance is done */}
      <div className="entrance-destination" ref={destination} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
