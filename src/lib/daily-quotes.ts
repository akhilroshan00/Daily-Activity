export type DailyQuote = {
  date: string;
  text: string;
  author: string;
  source: "Daylight" | "DummyJSON";
};

const builtIn = [
  "A small step today gives tomorrow a place to begin.",
  "Progress grows where curiosity meets a little practice.",
  "You do not need to finish everything to move something forward.",
  "Let today's effort be a gift to your future self.",
  "Learning one useful thing is a day well invested.",
  "Make room for mistakes; they often show the next step.",
  "Consistency begins with showing up for the next small task.",
  "Rest is part of the rhythm that keeps progress possible.",
  "An unfinished task is an invitation to choose your next move.",
  "Write down what you learned; small discoveries deserve a place.",
  "Choose one clear intention, then give it your attention.",
  "Your pace can be gentle and your direction can be steady.",
  "The work you repeat becomes the skill you keep.",
  "Start with what you know, and stay curious about what comes next.",
];

export function quoteDayIndex(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Choose a valid quote date.");
  const value = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(value.getTime()) ||
    value.toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid quote date.");
  return Math.floor(value.getTime() / 86400000);
}
const modulo = (value: number, size: number) => ((value % size) + size) % size;

export function fallbackQuote(date: string): DailyQuote {
  return {
    date,
    text: builtIn[modulo(quoteDayIndex(date), builtIn.length)],
    author: "Daylight",
    source: "Daylight",
  };
}

export function validDailyQuote(
  value: unknown,
  date: string,
): value is DailyQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as DailyQuote;
  return (
    quote.date === date &&
    typeof quote.text === "string" &&
    quote.text.trim().length > 0 &&
    quote.text.length <= 1000 &&
    typeof quote.author === "string" &&
    quote.author.trim().length > 0 &&
    quote.author.length <= 160 &&
    ["Daylight", "DummyJSON"].includes(quote.source)
  );
}

export async function loadDailyQuote(
  date: string,
  fetcher: typeof fetch = fetch,
): Promise<DailyQuote> {
  const day = quoteDayIndex(date);
  try {
    // Fetch public content only. No account, notes or activity data is sent.
    const response = await fetcher(
      `https://dummyjson.com/quotes/${modulo(day, 100) + 1}`,
      { signal: AbortSignal.timeout(3000), ...{ next: { revalidate: 86400 } } },
    );
    if (!response.ok) throw new Error("Quote service unavailable");
    const data = (await response.json()) as {
      quote?: unknown;
      author?: unknown;
    };
    const quote = {
      date,
      text: data.quote,
      author: data.author,
      source: "DummyJSON",
    };
    if (!validDailyQuote(quote, date))
      throw new Error("Invalid quote response");
    return quote;
  } catch {
    return fallbackQuote(date);
  }
}
