import { loadDailyQuote } from "@/lib/daily-quotes";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  try {
    return Response.json(await loadDailyQuote(date), {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return Response.json(
      { error: "Provide a valid date as YYYY-MM-DD." },
      { status: 400 },
    );
  }
}
