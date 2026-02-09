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

type AnalystPayload = {
  ticker: string;
  targets?: {
    mean: number | null;
    high: number | null;
    low: number | null;
    analystCount: number | null;
  };
  consensus?: {
    recommendationKey: string | null;
    recommendationMean: number | null;
  };
  upgrades?: Array<{
    epochGradeDate?: string | number | null;
    gradeDate?: string | null;
    epochDate?: number | null;
    firm?: string | null;
    fromGrade?: string | null;
    toGrade?: string | null;
    action?: string | null;
    priceTargetAction?: string | null;
    currentPriceTarget?: number | null;
    priorPriceTarget?: number | null;
  }>;
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

function formatNumber(n: number | undefined | null, maxDecimals = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

function isCLP(ticker: string, currency?: string) {
  return currency === "CLP" || ticker.endsWith(".SN");
}

function formatPrice(
  ticker: string,
  price: number | undefined,
  currency?: string
) {
  if (typeof price !== "number") return "—";
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

function consensusLabel(key: string | null | undefined) {
  if (!key) return "—";
  return key.replaceAll("_", " ").toLowerCase();
}

function consensusPillStyle(key: string | null | undefined) {
  const k = (key || "").toLowerCase();
  if (k.includes("buy")) {
    return { bg: "#ecfdf5", border: "#a7f3d0", color: "#065f46" };
  }
  if (k.includes("sell")) {
    return { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" };
  }
  if (k.includes("hold")) {
    return { bg: "#eff6ff", border: "#bfdbfe", color: "#1e3a8a" };
  }
  return { bg: "#f3f4f6", border: "#e5e7eb", color: "#374151" };
}

function formatAnalystDate(u: any) {
  const raw = u?.epochGradeDate ?? u?.gradeDate ?? u?.epochDate;
  if (!raw) return "—";

  // ISO string
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  }

  // Unix seconds
  if (typeof raw === "number") {
    const d = new Date(raw * 1000);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  }

  return "—";
}

export default function Page() {
  const [range, setRange] = useState<RangeKey>("1y");
  const [selected, setSelected] = useState<string>("AAPL");

  const [snapshot, setSnapshot] = useState<Record<string, QuoteRow>>({});
  const [history, setHistory] = useState<{ date: string; close: number }[]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  // Analyst data (desplegable)
  const [analyst, setAnalyst] = useState<AnalystPayload | null>(null);
  const [loadingAnalyst, setLoadingAnalyst] = useState(false);
  const [showAnalyst, setShowAnalyst] = useState(false);

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
        `/api/history?ticker=${encodeURIComponent(
          ticker
        )}&range=${encodeURIComponent(r)}`
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

  async function loadAnalyst(ticker: string) {
    setLoadingAnalyst(true);
    try {
      const res = await fetch(
        `/api/analyst?ticker=${encodeURIComponent(ticker)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Analyst error");
      setAnalyst(json);
    } catch {
      setAnalyst(null);
    } finally {
      setLoadingAnalyst(false);
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
    loadAnalyst(selected);
    setShowAnalyst(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, range]);

  const selectedTitle = cleanTicker(selected);

  const selectedPrice =
    selectedQuote && selectedQuote.ok
      ? formatPrice(
          selectedQuote.ticker,
          selectedQuote.price,
          selectedQuote.currency
        )
      : "—";

  const selectedCurrency =
    selectedQuote && selectedQuote.ok ? selectedQuote.currency : "";

  const selectedPct =
    selectedQuote && selectedQuote.ok
      ? pctMeta(selectedQuote.changePercent)
      : pctMeta(undefined);

  const t = analyst?.targets;
  const c = analyst?.consensus;

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
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.5 }}>
              Market Dashboard
            </h1>
            <span style={{ color: "#6b7280" }}>Big Techs + Chile (vista única)</span>
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
          {BIG7.map((tkr) => (
            <MiniCard
              key={tkr}
              ticker={tkr}
              row={snapshot[tkr]}
              selected={selected === tkr}
              onSelect={() => setSelected(tkr)}
            />
          ))}
        </Grid>

        {/* SECTION: CHILE */}
        <div style={{ height: 14 }} />
        <SectionHeader title="Chile" emoji="🇨🇱" />
        <Grid>
          {CHILE.map((tkr) => (
            <MiniCard
              key={tkr}
              ticker={tkr}
              row={snapshot[tkr]}
              selected={selected === tkr}
              onSelect={() => setSelected(tkr)}
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

          {/* RANGE */}
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

          {/* ANALYST (desplegable real) */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #eef0f4",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                Analistas (targets & consenso)
              </div>

              <button
                onClick={() => setShowAnalyst((v) => !v)}
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  borderRadius: 999,
                  padding: "6px 10px",
                  cursor: "pointer",
                  color: "#111827",
                }}
              >
                {showAnalyst ? "Ocultar" : "Ver"} recomendaciones
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                overflow: "hidden",
                maxHeight: showAnalyst ? 900 : 0,
                opacity: showAnalyst ? 1 : 0,
                transition: "all 240ms ease",
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #eef0f4",
                  background: "#fafafa",
                }}
              >
                {loadingAnalyst ? (
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    Consultando datos de analistas…
                  </div>
                ) : (
                  <>
                    {/* Metrics */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: 12,
                      }}
                    >
                      <Metric
                        label="Target promedio"
                        value={t?.mean != null ? formatNumber(t.mean) : "—"}
                      />
                      <Metric
                        label="Rango (low–high)"
                        value={
                          t?.low != null || t?.high != null
                            ? `${t?.low != null ? formatNumber(t.low) : "—"} – ${
                                t?.high != null ? formatNumber(t.high) : "—"
                              }`
                            : "—"
                        }
                      />
                      <Metric
                        label="# Analistas"
                        value={
                          t?.analystCount != null ? String(t.analystCount) : "—"
                        }
                      />
                      <div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Consenso</div>
                        <div style={{ marginTop: 6 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: `1px solid ${
                                consensusPillStyle(c?.recommendationKey).border
                              }`,
                              background: consensusPillStyle(c?.recommendationKey).bg,
                              color: consensusPillStyle(c?.recommendationKey).color,
                              fontWeight: 900,
                              textTransform: "capitalize",
                              fontSize: 12,
                            }}
                          >
                            {consensusLabel(c?.recommendationKey)}
                          </span>

                          {typeof c?.recommendationMean === "number" && (
                            <span
                              style={{
                                marginLeft: 10,
                                color: "#6b7280",
                                fontSize: 12,
                              }}
                            >
                              score: {c.recommendationMean.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Upgrades Table */}
                    {Array.isArray(analyst?.upgrades) && analyst.upgrades.length > 0 ? (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
                          Últimas 5 actualizaciones
                        </div>

                        <div style={{ display: "grid", gap: 8 }}>
                          {analyst.upgrades.slice(0, 5).map((u, i) => (
                            <div
                              key={i}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "110px 1.2fr 1fr 110px 110px",
                                gap: 10,
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "#fff",
                                border: "1px solid #eef0f4",
                                fontSize: 13,
                                alignItems: "center",
                              }}
                            >
                              <div style={{ color: "#6b7280" }}>{formatAnalystDate(u)}</div>

                              <div style={{ fontWeight: 800 }}>{u.firm || "—"}</div>

                              <div style={{ fontWeight: 800 }}>
                                {(u.fromGrade || "—")} → {(u.toGrade || "—")}
                                {u.action ? (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      color: "#6b7280",
                                      fontWeight: 700,
                                    }}
                                  >
                                    ({u.action})
                                  </span>
                                ) : null}
                              </div>

                              <div style={{ textAlign: "right", fontWeight: 800 }}>
                                {typeof u.priorPriceTarget === "number" && u.priorPriceTarget > 0
                                  ? formatNumber(u.priorPriceTarget, 2)
                                  : "—"}
                              </div>

                              <div style={{ textAlign: "right", fontWeight: 900 }}>
                                {typeof u.currentPriceTarget === "number" && u.currentPriceTarget > 0
                                  ? formatNumber(u.currentPriceTarget, 2)
                                  : "—"}
                              </div>

                              {u.priceTargetAction ? (
                                <div
                                  style={{
                                    gridColumn: "1 / -1",
                                    color: "#6b7280",
                                    fontSize: 12,
                                    marginTop: 2,
                                  }}
                                >
                                  Target action: {u.priceTargetAction}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                          Columnas: fecha · entidad · recomendación · target anterior · target nuevo
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
                        No hay actualizaciones recientes de analistas para este activo.
                      </div>
                    )}
                  </>
                )}
              </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 900, fontSize: 14 }}>{value}</div>
    </div>
  );
}

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
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.3 }}>
        {cleanTicker(ticker)}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>
          {ok ? formatPrice(ticker, price, currency) : "—"}
          <span style={{ marginLeft: 6, fontSize: 11, color: "#6b7280" }}>
            {currency}
          </span>
        </div>

        <div
          style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            color: meta.color,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 10 }}>{meta.arrow}</span>
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
