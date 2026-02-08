import YahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yahoo = new YahooFinance();

const RANGE_TO_DAYS: Record<string, number> = {
  "1m": 31,
  "3m": 93,
  "6m": 186,
  "1y": 366,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") || "").toUpperCase();
  const range = (searchParams.get("range") || "1y").toLowerCase();

  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }
  if (!RANGE_TO_DAYS[range]) {
    return Response.json({ error: "Invalid range" }, { status: 400 });
  }

  const days = RANGE_TO_DAYS[range];
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period2.getDate() - days);

  try {
    const rows: any[] = await yahoo.historical(ticker, {
      period1,
      period2,
      interval: "1d",
    });

    const data = (rows || [])
      .filter(r => r?.date && typeof r?.close === "number")
      .map(r => ({
        date: new Date(r.date).toISOString().slice(0, 10),
        close: r.close,
      }));

    return Response.json({ ticker, range, data });
  } catch (e: any) {
    console.error("HISTORY ERROR:", e);
    return Response.json(
      { error: "Failed to fetch history", details: e.message },
      { status: 500 }
    );
  }
}

