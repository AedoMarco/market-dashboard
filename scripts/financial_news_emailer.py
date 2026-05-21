#!/usr/bin/env python3
import json
import smtplib
import ssl
import os
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

try:
    import feedparser
except ImportError:
    os.system(f"{sys.executable} -m pip install feedparser -q")
    import feedparser

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "email_config.json")

YAHOO_FEEDS = [
    ("Top Stories",     "https://finance.yahoo.com/rss/topstories"),
    ("Mercados",        "https://finance.yahoo.com/news/rssindex"),
]

BLOOMBERG_FEEDS = [
    ("Markets",         "https://feeds.bloomberg.com/markets/news.rss"),
    ("Technology",      "https://feeds.bloomberg.com/technology/news.rss"),
]


def fetch_feed(url: str, limit: int = 8) -> list[dict]:
    feed = feedparser.parse(url)
    articles = []
    for entry in feed.entries[:limit]:
        articles.append({
            "title":     entry.get("title", "").strip(),
            "summary":   _clean(entry.get("summary", "")),
            "link":      entry.get("link", "#"),
            "published": entry.get("published", ""),
        })
    return articles


def _clean(text: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", "", text)
    return text[:200].strip() + ("…" if len(text) > 200 else "")


def fetch_all_news(limit_per_feed: int = 5) -> tuple[list[dict], list[dict]]:
    yahoo, bloomberg = [], []
    seen = set()

    for _label, url in YAHOO_FEEDS:
        for a in fetch_feed(url, limit_per_feed):
            if a["title"] not in seen:
                seen.add(a["title"])
                yahoo.append(a)

    for _label, url in BLOOMBERG_FEEDS:
        for a in fetch_feed(url, limit_per_feed):
            if a["title"] not in seen:
                seen.add(a["title"])
                bloomberg.append(a)

    return yahoo[:10], bloomberg[:10]


def _article_html(article: dict, accent: str) -> str:
    title = article["title"].replace("&", "&amp;").replace("<", "&lt;")
    summary = article["summary"].replace("&", "&amp;").replace("<", "&lt;")
    pub = article["published"][:16] if article["published"] else ""
    link = article["link"]
    return f"""
        <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #f0f0f0;">
          <a href="{link}" style="font-size:15px;font-weight:600;color:#0d0d0d;text-decoration:none;line-height:1.4;display:block;margin-bottom:5px;">{title}</a>
          <p style="margin:0 0 5px;font-size:13px;color:#555;line-height:1.6;">{summary}</p>
          <span style="font-size:11px;color:{accent};font-weight:600;">{pub}</span>
        </div>"""


def build_html(yahoo: list[dict], bloomberg: list[dict]) -> str:
    date_str = datetime.now().strftime("%A, %B %d, %Y")
    yahoo_html = "".join(_article_html(a, "#6001d2") for a in yahoo) or "<p style='color:#999;font-size:13px;'>No se encontraron artículos.</p>"
    bloomberg_html = "".join(_article_html(a, "#d44000") for a in bloomberg) or "<p style='color:#999;font-size:13px;'>No se encontraron artículos.</p>"

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Daily Financial News</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:660px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#0d0d0d;padding:28px 36px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">
          Financial Digest
        </div>
      </div>
      <p style="margin:6px 0 0;font-size:13px;color:#888;">{date_str}</p>
    </div>

    <!-- Yahoo Finance -->
    <div style="padding:28px 36px 8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <div style="width:3px;height:18px;background:#6001d2;border-radius:2px;"></div>
        <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6001d2;">Yahoo Finance</span>
      </div>
      {yahoo_html}
    </div>

    <!-- Divider -->
    <div style="margin:0 36px;border-top:2px solid #f4f4f4;"></div>

    <!-- Bloomberg -->
    <div style="padding:28px 36px 8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
        <div style="width:3px;height:18px;background:#d44000;border-radius:2px;"></div>
        <span style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#d44000;">Bloomberg</span>
      </div>
      {bloomberg_html}
    </div>

    <!-- Footer -->
    <div style="background:#f8f8f8;padding:16px 36px;border-top:1px solid #eee;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        Generado automáticamente · <a href="https://finance.yahoo.com" style="color:#aaa;">Yahoo Finance</a> &amp; <a href="https://bloomberg.com/markets" style="color:#aaa;">Bloomberg</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def send_email(html: str, config: dict) -> None:
    subject = f"Financial Digest — {datetime.now().strftime('%d %b %Y')}"
    recipients = config["recipients"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Financial Digest <{config['gmail_user']}>"
    msg["To"] = ", ".join(recipients)
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

    print("[1/3] Obteniendo noticias de Yahoo Finance y Bloomberg…")
    yahoo, bloomberg = fetch_all_news(limit_per_feed=6)
    print(f"      {len(yahoo)} artículos Yahoo · {len(bloomberg)} artículos Bloomberg")

    print("[2/3] Generando HTML…")
    html = build_html(yahoo, bloomberg)

    print("[3/3] Enviando email…")
    send_email(html, config)


if __name__ == "__main__":
    main()
