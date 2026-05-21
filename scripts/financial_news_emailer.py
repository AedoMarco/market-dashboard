#!/usr/bin/env python3
import json
import smtplib
import ssl
import os
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

DIAS_ES = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]
MESES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

def fecha_es(dt: datetime) -> str:
    return f"{DIAS_ES[dt.weekday()]}, {dt.day} de {MESES_ES[dt.month-1]} de {dt.year}"

try:
    import feedparser
except ImportError:
    os.system(f"{sys.executable} -m pip install feedparser -q --break-system-packages")
    import feedparser

try:
    import anthropic
except ImportError:
    os.system(f"{sys.executable} -m pip install anthropic -q --break-system-packages")
    import anthropic

try:
    import yfinance as yf
except ImportError:
    os.system(f"{sys.executable} -m pip install yfinance -q --break-system-packages")
    import yfinance as yf

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "email_config.json")

DF_FEEDS = [
    ("Diario Financiero", "https://news.google.com/rss/search?q=site:df.cl&hl=es-CL&gl=CL&ceid=CL:es"),
]

BLOOMBERG_FEEDS = [
    ("Markets",    "https://feeds.bloomberg.com/markets/news.rss"),
    ("Technology", "https://feeds.bloomberg.com/technology/news.rss"),
]


def fetch_feed(url: str, limit: int = 15) -> list[dict]:
    import calendar, time as _time
    feed = feedparser.parse(url)
    articles = []
    for entry in feed.entries[:limit]:
        parsed = entry.get("published_parsed") or entry.get("updated_parsed")
        ts = calendar.timegm(parsed) if parsed else 0
        articles.append({
            "title":     entry.get("title", "").strip(),
            "summary":   _clean(entry.get("summary", "")),
            "link":      entry.get("link", "#"),
            "published": entry.get("published", ""),
            "_ts":       ts,
        })
    return articles


def _clean(text: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def translate_and_summarize(articles: list[dict], already_spanish: bool = False) -> list[dict]:
    if not articles:
        return articles

    items_text = "\n\n".join(
        f"[{i+1}] TÍTULO: {a['title']}\nCONTENIDO: {a['summary'] or a['title']}"
        for i, a in enumerate(articles)
    )

    if already_spanish:
        instruction = "Resume cada noticia en español."
    else:
        instruction = "Traduce al español y resume cada noticia."

    prompt = f"""Eres un editor financiero. {instruction}
Para cada ítem devuelve un objeto JSON con:
- "titulo": título en español, conciso
- "resumen": resumen en español de máximo 8 líneas (unas 120 palabras), explicando los puntos clave

Responde SOLO con un array JSON válido, sin texto extra. Ejemplo: [{{"titulo":"...","resumen":"..."}}]

NOTICIAS:
{items_text}"""

    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        import re as _re, json as _json
        raw = message.content[0].text
        match = _re.search(r"\[.*\]", raw, _re.DOTALL)
        if match:
            translated = _json.loads(match.group())
            for i, t in enumerate(translated):
                if i < len(articles):
                    articles[i]["title"]   = t.get("titulo", articles[i]["title"])
                    articles[i]["summary"] = t.get("resumen", articles[i]["summary"])
    except Exception as e:
        print(f"[AVISO] No se pudo traducir/resumir: {e}. Se usará contenido original.")

    return articles


def fetch_all_news(limit_per_feed: int = 5) -> tuple[list[dict], list[dict]]:
    df, bloomberg = [], []
    seen = set()

    for _label, url in DF_FEEDS:
        for a in fetch_feed(url, limit_per_feed):
            if a["title"] not in seen:
                seen.add(a["title"])
                df.append(a)

    for _label, url in BLOOMBERG_FEEDS:
        for a in fetch_feed(url, limit_per_feed):
            if a["title"] not in seen:
                seen.add(a["title"])
                bloomberg.append(a)

    df        = sorted(df,        key=lambda a: a["_ts"], reverse=True)[:10]
    bloomberg = sorted(bloomberg, key=lambda a: a["_ts"], reverse=True)[:10]
    df        = translate_and_summarize(df,        already_spanish=True)
    bloomberg = translate_and_summarize(bloomberg, already_spanish=False)
    return df, bloomberg


INDICATORS = [
    {"label": "Valor Dólar",    "symbol": "USDCLP=X", "prefix": "$",    "decimals": 0},
    {"label": "Petróleo (WTI)", "symbol": "CL=F",     "prefix": "US$",  "decimals": 2},
    {"label": "Futuros Nasdaq",  "symbol": "NQ=F",     "prefix": "",     "decimals": 0},
    {"label": "Futuros S&P500", "symbol": "ES=F",     "prefix": "",     "decimals": 0},
]


def fetch_indicators() -> list[dict]:
    results = []
    for ind in INDICATORS:
        try:
            ticker = yf.Ticker(ind["symbol"])
            fi     = ticker.fast_info
            price  = fi.last_price
            prev   = fi.previous_close
            pct    = ((price - prev) / prev * 100) if prev else 0.0
            fmt    = f"{ind['prefix']}{price:,.{ind['decimals']}f}"
            results.append({
                "label":  ind["label"],
                "value":  fmt,
                "pct":    pct,
                "up":     pct >= 0,
            })
        except Exception:
            results.append({"label": ind["label"], "value": "—", "pct": 0.0, "up": True})
    return results


def _indicator_cell(ind: dict) -> str:
    color  = "#16a34a" if ind["up"] else "#dc2626"
    arrow  = "&#9650;" if ind["up"] else "&#9660;"
    sign   = "+" if ind["up"] else ""
    return f"""
      <td style="width:25%;padding:16px 8px;text-align:center;border-right:1px solid #eee;">
        <div style="font-size:10px;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">{ind['label']}</div>
        <div style="font-size:17px;font-weight:700;color:#0d0d0d;margin-bottom:4px;">{ind['value']}</div>
        <div style="font-size:12px;font-weight:600;color:{color};">{arrow} {sign}{ind['pct']:.2f}%</div>
      </td>"""


def _article_html(article: dict, accent: str) -> str:
    title   = article["title"].replace("&", "&amp;").replace("<", "&lt;")
    summary = article["summary"].replace("&", "&amp;").replace("<", "&lt;")
    pub     = article["published"][:16] if article["published"] else ""
    link    = article["link"]
    return f"""
        <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f0f0f0;">
          <a href="{link}" style="font-size:15px;font-weight:600;color:#0d0d0d;text-decoration:none;line-height:1.4;display:block;margin-bottom:5px;">{title}</a>
          <p style="margin:0 0 5px;font-size:13px;color:#555;line-height:1.6;">{summary}</p>
          <span style="font-size:11px;color:{accent};font-weight:600;">{pub}</span>
        </div>"""


def build_html(df: list[dict], bloomberg: list[dict], indicators: list[dict]) -> str:
    date_str       = fecha_es(datetime.now())
    df_html        = "".join(_article_html(a, "#c8102e") for a in df)        or "<p style='color:#999;font-size:13px;'>No se encontraron artículos.</p>"
    bloomberg_html = "".join(_article_html(a, "#d44000") for a in bloomberg) or "<p style='color:#999;font-size:13px;'>No se encontraron artículos.</p>"
    cells_html     = "".join(_indicator_cell(i) for i in indicators)

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Resumen Financiero</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:660px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#0d0d0d;padding:28px 36px;">
      <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">
        &#127464;&#127473; &#127482;&#127480; Resumen Financiero
      </div>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">{date_str}</p>
    </div>

    <!-- Indicadores -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #eee;">
      <tr>
        {cells_html}
        <td style="width:0;padding:0;border:none;"></td>
      </tr>
    </table>

    <!-- Diario Financiero -->
    <div style="padding:28px 36px 8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <div style="width:3px;height:18px;background:#c8102e;border-radius:2px;"></div>
        <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#c8102e;">&#127464;&#127473; Diario Financiero</span>
      </div>
      {df_html}
    </div>

    <!-- Divider -->
    <div style="margin:0 36px;border-top:2px solid #f4f4f4;"></div>

    <!-- Bloomberg -->
    <div style="padding:28px 36px 8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <div style="width:3px;height:18px;background:#d44000;border-radius:2px;"></div>
        <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#d44000;">&#127482;&#127480; Bloomberg</span>
      </div>
      {bloomberg_html}
    </div>

    <!-- Footer -->
    <div style="background:#f8f8f8;padding:16px 36px;border-top:1px solid #eee;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        Generado automáticamente · <a href="https://www.df.cl" style="color:#aaa;">Diario Financiero</a> &amp; <a href="https://bloomberg.com/markets" style="color:#aaa;">Bloomberg</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def send_email(html: str, config: dict) -> None:
    now     = datetime.now()
    subject = f"🇨🇱🇺🇸 Resumen Financiero — {now.day} de {MESES_ES[now.month-1]} de {now.year}"
    recipients = config["recipients"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Resumen Financiero <{config['gmail_user']}>"
    msg["To"]      = ", ".join(recipients)
    msg.attach(MIMEText(html, "html", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
        server.login(config["gmail_user"], config["gmail_app_password"])
        server.sendmail(config["gmail_user"], recipients, msg.as_string())

    print(f"[OK] Email enviado a {len(recipients)} destinatario(s): {', '.join(recipients)}")


def main():
    if not os.path.exists(CONFIG_PATH):
        print(f"[ERROR] No se encontró {CONFIG_PATH}")
        print("Copia email_config.example.json a email_config.json y completa tus datos.")
        sys.exit(1)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    print("[1/4] Obteniendo indicadores financieros…")
    indicators = fetch_indicators()
    for ind in indicators:
        sign = "+" if ind["up"] else ""
        print(f"      {ind['label']}: {ind['value']}  ({sign}{ind['pct']:.2f}%)")

    print("[2/4] Obteniendo noticias del Diario Financiero y Bloomberg…")
    df, bloomberg = fetch_all_news(limit_per_feed=10)
    print(f"      {len(df)} artículos DF · {len(bloomberg)} artículos Bloomberg")

    print("[3/4] Generando HTML…")
    html = build_html(df, bloomberg, indicators)

    print("[4/4] Enviando email…")
    send_email(html, config)


if __name__ == "__main__":
    main()
