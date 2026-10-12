"use client";
import { useEffect, useRef, type ReactNode } from "react";
export default function ScrollEntrance({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const destination = useRef<HTMLDivElement>(null);
  const focusAfterEntrance = useRef(false);
  useEffect(() => {
    const element = section.current,
      clip = video.current,
      app = destination.current;
    if (!element || !clip || !app) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      target = 0,
      progress = 0,
      previous = 0;
    const seek = () => {
      if (reduced.matches || clip.seeking || !Number.isFinite(clip.duration))
        return;
      const time =
        Math.min(1, progress / 0.82) * Math.max(0, clip.duration - 0.05);
      if (Math.abs(clip.currentTime - time) > 0.035) clip.currentTime = time;
    };
    const tick = (now: number) => {
      const elapsed = Math.min(50, previous ? now - previous : 16);
      previous = now;
      progress += (target - progress) * (1 - Math.exp(-elapsed / 65));
      if (Math.abs(target - progress) < 0.0005) progress = target;
      const fade = Math.min(1, Math.max(0, (progress - 0.72) / 0.28));
      const eased = fade * fade * (3 - 2 * fade);
      element.style.setProperty("--entrance-opacity", String(1 - eased));
      element.style.setProperty(
        "--entrance-scale",
        String(1 + progress * 0.025),
      );
      app.inert = target < 0.99 && !reduced.matches;
      if (!app.inert && focusAfterEntrance.current) {
        app.focus({ preventScroll: true });
        focusAfterEntrance.current = false;
      }
      seek();
      frame = Math.abs(target - progress) > 0 ? requestAnimationFrame(tick) : 0;
      if (!frame) previous = 0;
    };
    const schedule = () => {
      target = Math.min(
        1,
        Math.max(
          0,
          -element.getBoundingClientRect().top /
            Math.max(1, element.offsetHeight - innerHeight),
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
        <div className="entrance-stage">
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
      </section>
      <div className="entrance-destination" ref={destination} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
