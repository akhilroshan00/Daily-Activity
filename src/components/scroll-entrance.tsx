"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
export default function ScrollEntrance({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const destination = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = section.current;
    const clip = video.current;
    if (!element || !clip) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let target = 0;
    const seek = () => {
      if (reduced.matches || clip.seeking || !Number.isFinite(clip.duration))
        return;
      if (Math.abs(clip.currentTime - target) > 0.08) clip.currentTime = target;
    };
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(
          0,
          -rect.top / Math.max(1, element.offsetHeight - innerHeight),
        ),
      );
      element.style.setProperty("--entrance-progress", String(progress));
      target = progress * Math.max(0, clip.duration - 0.05);
      seek();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
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
        aria-label="Welcome to Daylight"
      >
        <div className="entrance-stage">
          <div className="entrance-topline">
            <span>daylight.</span>
            <button type="button" onClick={enter}>
              Go to app <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="entrance-copy">
            <span className="eyebrow">A LITTLE TIME. A LITTLE GROWTH.</span>
            <h1>
              Make room
              <br />
              for <em>your day.</em>
            </h1>
            <p>Your time, your learning, your progress.</p>
          </div>
          <div className="entrance-film">
            <video
              ref={video}
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
              poster="/daylight-entrance-poster.jpg"
              src="/daylight-entrance.mp4"
            />
            <div className="entrance-film-label">
              <span>SMALL STEPS, EVERY DAY</span>
              <span>DAYLIGHT / 01</span>
            </div>
          </div>
          <button className="entrance-scroll" type="button" onClick={enter}>
            <ArrowDown size={18} /> Scroll to begin{" "}
            <span className="entrance-track">
              <span />
            </span>
          </button>
        </div>
      </section>
      <div className="entrance-destination" ref={destination} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
