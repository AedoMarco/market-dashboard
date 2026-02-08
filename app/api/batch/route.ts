import YahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yahoo = new YahooFinance();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get("tickers") || "";

  const tickers = tickersParam
    .split(",")
    .map(t => t.trim().toUpperCase())
    .filter(Boolean);

  if (!tickers.length) {
    return Response.json({ error: "Missing tickers" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const q: any = await yahoo.quote(ticker);
      return {
        ticker,
        name: q.shortName || q.longName || ticker,
        price: q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent,
        currency: q.currency,
      };
    })
  );

  const data = results.map((r, i) => {
    const ticker = tickers[i];
    if (r.status === "fulfilled") return { ok: true, ...r.value };
    return { ok: false, ticker, error: (r.reason?.message || String(r.reason)) };
  });

  return Response.json({ data });
}
