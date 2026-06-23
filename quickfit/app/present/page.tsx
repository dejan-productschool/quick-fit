"use client";

// The "stage screen" — put this on the big display during Beat 5.
// It shows a QR code pointing at the live QuickFit deployment, plus the live
// count + a ticker of the latest workouts as the room builds.
//
// The QR always points at the production site so phones can reach it even if
// this page is opened locally. Override with NEXT_PUBLIC_SITE_URL if the
// deployment URL ever changes.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://quick-fit-neon.vercel.app";

type Feed = { items: { id: string; request: string; title: string }[]; total: number };

export default function Present() {
  const url = SITE_URL;
  const [feed, setFeed] = useState<Feed>({ items: [], total: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/feed", { cache: "no-store" });
        setFeed(await res.json());
      } catch {}
    };
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <main style={styles.main}>
      <div style={styles.left}>
        <div style={styles.kicker}>Scan to build your workout</div>
        <div style={styles.qrBox}>
          {url ? <QRCodeSVG value={url} size={300} bgColor="#ffffff" fgColor="#0c0c0d" includeMargin /> : <div style={{ width: 300, height: 300 }} />}
        </div>
        <div style={styles.url}>{url.replace(/^https?:\/\//, "") || "…"}</div>
        <div style={styles.howto}>Type your time, energy &amp; equipment → get a workout in seconds</div>
        <div style={styles.countWrap}>
          <span style={styles.count}>{feed.total}</span>
          <span style={styles.countLabel}>workouts built in this room</span>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.rightHead}>Live wall</div>
        <div style={styles.ticker}>
          {feed.items.length === 0 ? (
            <div style={styles.empty}>Waiting for the first workout… pull out your phone.</div>
          ) : (
            feed.items.slice(0, 8).map((f) => (
              <div key={f.id} style={styles.item}>
                <div style={styles.itemIdea}>🏃 {f.request}</div>
                <div style={styles.itemHyp}>{f.title}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    gap: 56,
    padding: "56px 64px",
    background: "#f3f2ef",
    color: "#0c0c0d",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: "border-box",
  },
  left: { flex: "0 0 420px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" },
  kicker: { fontFamily: "'Anton', sans-serif", fontSize: 30, letterSpacing: 0.5, color: "#0c0c0d", marginBottom: 26, textTransform: "uppercase", lineHeight: 1 },
  qrBox: { background: "#fff", padding: 20, borderRadius: 20, border: "1px solid #e4e3df", boxShadow: "0 10px 40px rgba(12,12,13,0.08)" },
  url: { marginTop: 22, fontSize: 17, color: "#6b6e76", fontFamily: "ui-monospace, 'SF Mono', monospace", wordBreak: "break-all" },
  howto: { marginTop: 14, fontSize: 15, color: "#33353c", maxWidth: 340, lineHeight: 1.45 },
  countWrap: { marginTop: 36, display: "flex", flexDirection: "column", alignItems: "center" },
  count: { fontFamily: "'Anton', sans-serif", fontSize: 104, lineHeight: 1, color: "#2563eb" },
  countLabel: { fontSize: 16, color: "#6b6e76", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
  right: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  rightHead: { fontFamily: "'Anton', sans-serif", fontSize: 24, textTransform: "uppercase", letterSpacing: "0.01em", color: "#0c0c0d", marginBottom: 20 },
  ticker: { display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" },
  empty: { color: "#6b6e76", fontSize: 18, padding: "24px 0" },
  item: { background: "#fff", border: "1px solid #e4e3df", borderRadius: 14, padding: "16px 20px", animation: "rise 0.4s ease" },
  itemIdea: { fontSize: 14, color: "#6b6e76", marginBottom: 6 },
  itemHyp: { fontSize: 17, lineHeight: 1.45, color: "#23252b" },
};
