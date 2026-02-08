import YahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yahoo = new YahooFinance();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") || "").toUpperCase();

  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  try {
    const q: any = await yahoo.quote(ticker);

    return Response.json({
      ticker,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      currency: q.currency,
      name: q.shortName || q.longName || ticker,
    });
  } catch (e: any) {
    console.error("QUOTE ERROR:", e);
    return Response.json(
      { error: "Failed to fetch quote", details: e.message },
      { status: 500 }
    );
  }
}
