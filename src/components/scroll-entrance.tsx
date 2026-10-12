"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function ScrollEntrance({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const wrapper3d = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const destination = useRef<HTMLDivElement>(null);
  const focusAfterEntrance = useRef(false);

  useEffect(() => {
    const el = section.current,
      stageEl = stage.current,
      wrapEl = wrapper3d.current,
      clip = video.current,
      hintEl = hint.current,
      app = destination.current;
    if (!el || !stageEl || !wrapEl || !clip || !app) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");

    let frame = 0,
      target = 0,
      progress = 0,
      prev = 0;

    /* ── Seek the video to match scroll progress ── */
    const seek = () => {
      if (reduced.matches || clip.seeking || !Number.isFinite(clip.duration))
        return;
      // Map first 90% of scroll to full video duration
      const t = Math.min(1, progress / 0.9) * Math.max(0, clip.duration - 0.05);
      if (Math.abs(clip.currentTime - t) > 0.02) clip.currentTime = t;
    };

    /* ── Main animation tick ── */
    const tick = (now: number) => {
      const elapsed = Math.min(50, prev ? now - prev : 16);
      prev = now;

      // Smooth lerp — 90 ms time constant for silky feel
      progress += (target - progress) * (1 - Math.exp(-elapsed / 90));
      if (Math.abs(target - progress) < 0.0002) progress = target;

      const p = progress; // alias

      // ─ 3-D perspective pull-back ─
      // perspective: starts very deep (800px) zoomed in, relaxes to a wide 1800px
      const perspective = 800 + p * 1000;
      // rotateX: starts at ~12° tilt (looking down at the scene) → 0° flat
      const rotX = (1 - p) * 12;
      // scale: video starts at 1.35× (inside the scene) → 1× (fully framed)
      const videoScale = 1.35 - p * 0.35;
      clip.style.setProperty("--entrance-video-scale", String(Math.max(1, videoScale)));

      // ─ Frame border radius grows from 0 → 28px ─
      const radius = Math.min(28, p * 52);

      // ─ Dark ring (border) around video grows from 0 → 60px ─
      const ring = Math.min(60, p * 110);

      wrapEl.style.perspective = `${perspective}px`;
      wrapEl.style.transform = `rotateX(${rotX}deg)`;
      wrapEl.style.borderRadius = `${radius}px`;
      wrapEl.style.boxShadow = `0 0 0 ${ring}px #000, 0 40px 120px #0008`;

      // ─ Stage fade: starts fading at 62% scroll, fully gone by 100% ─
      const fade = Math.min(1, Math.max(0, (p - 0.62) / 0.38));
      const eased = fade * fade * (3 - 2 * fade); // smooth-step
      stageEl.style.opacity = String(1 - eased);

      // ─ Scroll hint fades away in the first 15% of scroll ─
      if (hintEl) {
        hintEl.style.setProperty(
          "--entrance-hint-opacity",
          String(Math.max(0, 1 - p / 0.15)),
        );
      }

      // ─ Unlock app once entrance is complete ─
      app.inert = target < 0.995 && !reduced.matches;
      if (!app.inert && focusAfterEntrance.current) {
        app.focus({ preventScroll: true });
        focusAfterEntrance.current = false;
      }

      seek();
      frame =
        Math.abs(target - progress) > 0.0002
          ? requestAnimationFrame(tick)
          : 0;
      if (!frame) prev = 0;
    };

    /* ── Recalculate target from scroll position ── */
    const schedule = () => {
      target = Math.min(
        1,
        Math.max(
          0,
          -el.getBoundingClientRect().top /
            Math.max(1, el.offsetHeight - innerHeight),
        ),
      );
      if (reduced.matches) {
        progress = target;
        app.inert = false;
      }
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const loaded = () => {
      clip.pause();
      schedule();
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    clip.addEventListener("loadeddata", loaded);
    clip.addEventListener("seeked", seek);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      app.inert = false;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      clip.removeEventListener("loadeddata", loaded);
      clip.removeEventListener("seeked", seek);
    };
  }, []);

  function enter() {
    const target = destination.current;
    if (!target) return;
    target.inert = false;
    focusAfterEntrance.current = true;
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
  }

  return (
    <>
      <section
        ref={section}
        className="scroll-entrance"
        aria-label="Scroll to reveal your Daylight workspace"
      >
        <div className="entrance-stage" ref={stage}>
          {/* 3D perspective frame wrapper */}
          <div className="entrance-3d" ref={wrapper3d}>
            <button className="entrance-skip" onClick={enter}>
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            <span>scroll</span>
          </div>
        </div>
      </section>
      <div className="entrance-destination" ref={destination} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
