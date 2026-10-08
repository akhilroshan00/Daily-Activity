"use client";
import { useEffect, useState } from "react";
import { Quote, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  fallbackQuote,
  validDailyQuote,
  type DailyQuote,
} from "@/lib/daily-quotes";

export default function DailyQuoteArea({ date }: { date: string }) {
  const [loaded, setLoaded] = useState<DailyQuote | null>(null);
  const quote = loaded?.date === date ? loaded : fallbackQuote(date);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const key = `daylight.quote.v1:${date}`;
    try {
      const previous: unknown = JSON.parse(localStorage.getItem(key) || "null");
      if (validDailyQuote(previous, date)) {
        setLoaded(previous);
        return;
      }
    } catch {
      /* Quotes work without browser storage. */
    }
    void fetch(`/api/quote?date=${encodeURIComponent(date)}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: unknown) => {
        if (!active || !validDailyQuote(result, date)) return;
        setLoaded(result);
        try {
          localStorage.setItem(key, JSON.stringify(result));
        } catch {
          /* Keep the visible quote for this session. */
        }
      })
      .catch(() => {
        /* The built-in quote is already displayed. */
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [date]);
  return (
    <aside className="daily-quote" aria-label={`Motivation for ${date}`}>
      <Quote className="daily-quote-icon" size={27} aria-hidden="true" />
      <div>
        <div className="daily-quote-heading">
          <Sparkles size={13} aria-hidden="true" />A little inspiration ·{" "}
          {format(parseISO(date), "d MMMM")}
        </div>
        <blockquote>
          <p>{quote.text}</p>
          <footer>— {quote.author}</footer>
        </blockquote>
        {quote.source === "DummyJSON" && (
          <a
            href="https://dummyjson.com/docs/quotes"
            target="_blank"
            rel="noopener noreferrer"
          >
            Quote source
          </a>
        )}
      </div>
    </aside>
  );
}
