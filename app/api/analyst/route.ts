import YahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yahoo = new YahooFinance();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") || "").toUpperCase();
  if (!ticker) return Response.json({ error: "Missing ticker" }, { status: 400 });

  try {
   const summary: any = await yahoo.quoteSummary(ticker, {
  modules: [
    "financialData",
    "recommendationTrend",
    "upgradeDowngradeHistory"
  ],
});
    const fd = summary?.financialData || {};
    const rt = summary?.recommendationTrend || {};

    return Response.json({
  ticker,
  targets: {
    mean: fd?.targetMeanPrice ?? null,
    high: fd?.targetHighPrice ?? null,
    low: fd?.targetLowPrice ?? null,
    analystCount: fd?.numberOfAnalystOpinions ?? null,
  },
  consensus: {
    recommendationKey: fd?.recommendationKey ?? null,
    recommendationMean: fd?.recommendationMean ?? null,
  },
  upgrades: summary?.upgradeDowngradeHistory?.history?.slice(0, 5) ?? [],
});
  } catch (e: any) {
    return Response.json(
      { error: "Failed to fetch analyst data", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
