"use client";
import { useEffect, useState, type ReactNode } from "react";

export default function ScrollEntrance({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 800 : 2500; // 2.5 seconds splash display

    const timer = setTimeout(() => {
      setFading(true);
      const dismissTimer = setTimeout(() => {
        setVisible(false);
      }, 500); // 500ms smooth fade transition
      return () => clearTimeout(dismissTimer);
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  function skipSplash() {
    setFading(true);
    setTimeout(() => setVisible(false), 300);
  }

  return (
    <>
      {visible && (
        <div
          className={`splash-overlay ${fading ? "splash-overlay-fading" : ""}`}
          onClick={skipSplash}
          role="status"
          aria-label="Welcome to Daylight"
        >
          <div className="splash-card">
            <div className="splash-logo-container">
              <img
                src="/splash-logo.jpg"
                alt="Daylight Logo"
                className="splash-logo-img"
                width={130}
                height={130}
              />
            </div>
            <div className="splash-brand-text">
              daylight<span className="splash-brand-dot">.</span>
            </div>
            <div className="splash-subtext">Small steps. Your progress.</div>
            <div className="splash-loader-track" aria-hidden="true">
              <div className="splash-loader-bar" />
            </div>
          </div>
        </div>
      )}
      <div
        className={`splash-destination ${
          !mounted || visible ? "splash-content-entering" : "splash-content-ready"
        }`}
      >
        {children}
      </div>
    </>
  );
}
