"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type RangeKey = "1m" | "3m" | "6m" | "1y";

type QuoteRow =
  | {
      ok: true;
      ticker: string;
      name: string;
      price: number;
      changePercent: number;
      currency: string;
    }
  | {
      ok: false;
      ticker: string;
      error: string;
    };

const BIG7 = ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"];

const CHILE = [
  "LTM.SN",
  "SQM-B.SN",
  "CHILE.SN",
  "ITAUCL.SN",
  "CENCOSUD.SN",
  "BSANTANDER.SN",
  "FALABELLA.SN",
  "ENELAM.SN",
  "BCI.SN",
  "EMBONOR-A.SN",
];

const RANGE_LABEL: Record<RangeKey, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
};

function cleanTicker(ticker: string) {
  return ticker.replace(".SN", "");
}

function formatNumber(n: number | undefined, maxDecimals = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

function isCLP(ticker: string, currency?: string) {
  return currency === "CLP" || ticker.endsWith(".SN");
}

function formatPrice(ticker: string, price: number | undefined, currency?: string) {
  if (typeof price !== "number") return "—";
  // Chile: sin decimales, con separador miles
  const decimals = isCLP(ticker, currency) ? 0 : 2;
  return price.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function pctMeta(pct: number | undefined) {
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    return { text: "—", color: "#6b7280", arrow: "" };
  }
  const up = pct >= 0;
  return {
    text: `${up ? "+" : ""}${pct.toFixed(2)}%`,
    color: up ? "#16a34a" : "#dc2626",
    arrow: up ? "▲" : "▼",
  };
}

export default function Page() {
  const [range, setRange] = useState<RangeKey>("1y");
  const [selected, setSelected] = useState<string>("AAPL");

  const [snapshot, setSnapshot] = useState<Record<string, QuoteRow>>({});
  const [history, setHistory] = useState<{ date: string; close: number }[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  const allTickers = useMemo(() => [...BIG7, ...CHILE], []);
  const selectedQuote = snapshot[selected];

  async function loadSnapshot() {
    setLoadingSnapshot(true);
    setError("");
    try {
      const res = await fetch(
        `/api/batch?tickers=${encodeURIComponent(allTickers.join(","))}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load snapshot");

      const map: Record<string, QuoteRow> = {};
      for (const row of (json?.data || []) as QuoteRow[]) {
        map[row.ticker] = row;
      }
      setSnapshot(map);
    } catch (e: any) {
      setError(e?.message || "Snapshot error");
      setSnapshot({});
    } finally {
      setLoadingSnapshot(false);
    }
  }

  async function loadHistory(ticker: string, r: RangeKey) {
    setLoadingHistory(true);
    setError("");
    try {
      const res = await fetch(
        `/api/history?ticker=${encodeURIComponent(ticker)}&range=${encodeURIComponent(r)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load history");
      setHistory(json?.data || []);
    } catch (e: any) {
      setError(e?.message || "History error");
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadSnapshot();
    const id = setInterval(loadSnapshot, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHistory(selected, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, range]);

  const selectedTitle = cleanTicker(selected);

  const selectedPrice =
    selectedQuote && selectedQuote.ok
      ? formatPrice(selectedQuote.ticker, selectedQuote.price, selectedQuote.currency)
      : "—";

  const selectedCurrency =
    selectedQuote && selectedQuote.ok ? selectedQuote.currency : "";

  const selectedPct =
    selectedQuote && selectedQuote.ok ? pctMeta(selectedQuote.changePercent) : pctMeta(undefined);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7fb",
        padding: 24,
        fontFamily: "system-ui",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        {/* HEADER */}
        <header style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.5 }}>
              Market Dashboard
            </h1>
            <span style={{ color: "#6b7280" }}>
              Big Techs + Chile (vista única)
            </span>
          </div>
        </header>

        {/* ERROR */}
        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* SECTION: BIG TECH */}
        <SectionHeader
          title="Big Techs"
          emoji="🇺🇸"
          right={loadingSnapshot ? "Actualizando..." : ""}
        />
        <Grid>
          {BIG7.map((t) => (
            <MiniCard
              key={t}
              ticker={t}
              row={snapshot[t]}
              selected={selected === t}
              onSelect={() => setSelected(t)}
            />
          ))}
        </Grid>

        {/* SECTION: CHILE */}
        <div style={{ height: 14 }} />
        <SectionHeader title="Chile" emoji="🇨🇱" />
        <Grid>
          {CHILE.map((t) => (
            <MiniCard
              key={t}
              ticker={t}
              row={snapshot[t]}
              selected={selected === t}
              onSelect={() => setSelected(t)}
            />
          ))}
        </Grid>

        {/* PANEL: CHART */}
        <div style={{ height: 18 }} />

        <div
          style={{
            background: "#fff",
            border: "1px solid #eef0f4",
            borderRadius: 18,
            boxShadow: "0 10px 30px rgba(17,24,39,0.06)",
            overflow: "hidden",
          }}
        >
          {/* PANEL HEADER */}
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid #eef0f4",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Seleccionado</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.2 }}>
                {selectedTitle}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 900 }}>
                {selectedPrice}
                <span style={{ fontSize: 12, marginLeft: 8, color: "#6b7280" }}>
                  {selectedCurrency}
                </span>
              </div>
              <div style={{ color: selectedPct.color, fontWeight: 800 }}>
                <span style={{ marginRight: 6 }}>{selectedPct.arrow}</span>
                {selectedPct.text}
              </div>
            </div>
          </div>

          {/* RANGE (debajo de tarjetas y arriba del gráfico) */}
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              borderBottom: "1px solid #eef0f4",
              background: "#fafafa",
            }}
          >
            <span style={{ color: "#6b7280", fontSize: 13 }}>Rango</span>
            {(["1m", "3m", "6m", "1y"] as RangeKey[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: r === range ? "#111827" : "#fff",
                  color: r === range ? "#fff" : "#111827",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}

            <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
              {loadingHistory ? "Cargando gráfico..." : `${history.length} pts`}
            </div>
          </div>

          {/* CHART */}
          <div style={{ height: 440, padding: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={28} />
                <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="close" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ height: 22 }} />
      </div>
    </main>
  );
}

/** UI components */

function SectionHeader({
  title,
  emoji,
  right,
}: {
  title: string;
  emoji: string;
  right?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        margin: "6px 0 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 999,
            background: "#fff",
            border: "1px solid #eef0f4",
            fontWeight: 800,
          }}
        >
          {title} <span style={{ fontWeight: 600 }}>{emoji}</span>
        </span>
      </div>

      <div style={{ color: "#6b7280", fontSize: 13 }}>{right || ""}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function MiniCard({
  row,
  ticker,
  selected,
  onSelect,
}: {
  row: QuoteRow | undefined;
  ticker: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const ok = row && row.ok;
  const pct = ok ? row.changePercent : undefined;
  const currency = ok ? row.currency : "";
  const price = ok ? row.price : undefined;

  const meta = pctMeta(pct);

  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 14,
        border: selected ? "2px solid #111827" : "1px solid #eef0f4",
        background: "#fff",
        cursor: "pointer",
        boxShadow: selected
          ? "0 10px 25px rgba(17,24,39,0.10)"
          : "0 8px 20px rgba(17,24,39,0.06)",
        transition: "transform 120ms ease",
        minHeight: 74,
      }}
      title={ticker}
      onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.99)"}
      onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
    >
      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.3 }}>
        {cleanTicker(ticker)}
      </div>

      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900 }}>
          {ok ? formatPrice(ticker, price, currency) : "—"}
          <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7280" }}>
            {currency}
          </span>
        </div>

        <div style={{ fontWeight: 900, color: meta.color, fontSize: 13 }}>
          <span style={{ marginRight: 6, fontSize: 11 }}>{meta.arrow}</span>
          {meta.text}
        </div>
      </div>

      {!ok && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>
          No disponible
        </div>
      )}
    </button>
  );
}
