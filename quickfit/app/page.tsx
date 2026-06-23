"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAMPLES = [
  "10 minutes, no equipment, just woke up",
  "20 minutes with dumbbells, leg day",
  "7 minutes in a hotel room, full body",
  "30 minutes, high energy, core + cardio",
];

type Move = { name: string; detail: string };
type Workout = { title: string; focus: string; durationMin: number; warmup: string; moves: Move[]; coachNote: string };
type WorkoutResponse = { blockedAt: "input" | "output" | null; flags: string[]; safeMessage?: string; result: Workout | null; mock: boolean };
type Feed = { items: { id: string; request: string; title: string }[]; total: number };

function earnBadges(w: Workout, streak: number): { emoji: string; label: string }[] {
  const b: { emoji: string; label: string }[] = [];
  if (w.durationMin <= 10) b.push({ emoji: "⚡", label: "Speed Demon" });
  if (w.durationMin >= 25) b.push({ emoji: "🏋️", label: "Iron Will" });
  if (w.moves.length >= 5) b.push({ emoji: "🔥", label: "Full Send" });
  if (/no.?(?:gear|equipment)|bodyweight/i.test(w.focus)) b.push({ emoji: "🤸", label: "Bare Bones" });
  if (/core/i.test(w.focus)) b.push({ emoji: "🎯", label: "Core Locked" });
  if (/cardio|hiit/i.test(w.focus)) b.push({ emoji: "💨", label: "Sweat Mode" });
  if (/leg/i.test(w.focus)) b.push({ emoji: "🦵", label: "Leg Day" });
  if (/upper/i.test(w.focus)) b.push({ emoji: "💪", label: "Upper Deck" });
  if (/gentle|low/i.test(w.focus)) b.push({ emoji: "🧘", label: "Easy Flow" });
  if (/high.?intensity|high energy/i.test(w.focus)) b.push({ emoji: "🚀", label: "Beast Mode" });
  if (streak >= 3) b.push({ emoji: "🔥", label: `${streak} Streak` });
  return b;
}

function xpForWorkout(w: Workout): number {
  let xp = 50;
  xp += w.moves.length * 5;
  if (w.durationMin >= 20) xp += 15;
  return xp;
}

function levelFromXp(xp: number): { level: number; title: string; progress: number; next: number } {
  const thresholds = [0, 100, 250, 500, 800, 1200];
  const titles = ["Newbie", "Mover", "Hustler", "Athlete", "Machine", "Legend"];
  let level = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) { level = i; break; }
  }
  const floor = thresholds[level];
  const ceil = thresholds[level + 1] ?? thresholds[level] + 500;
  return { level, title: titles[level], progress: ((xp - floor) / (ceil - floor)) * 100, next: ceil };
}

function Confetti() {
  const colors = ["#eeff00", "#d6e600", "#f5e642", "#f59e0b", "#06b6d4", "#34d399"];
  return (
    <div className="confetti-wrap" aria-hidden>
      {Array.from({ length: 36 }).map((_, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{
            left: `${Math.random() * 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${Math.random() * 0.4}s`,
            animationDuration: `${0.8 + Math.random() * 0.6}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkoutResponse | null>(null);
  const [feed, setFeed] = useState<Feed>({ items: [], total: 0 });
  const [xp, setXp] = useState(0);
  const [buildCount, setBuildCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [xpPop, setXpPop] = useState<number | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  async function loadFeed() {
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      setFeed(await res.json());
    } catch {}
  }

  useEffect(() => {
    loadFeed();
    const t = setInterval(loadFeed, 2500);
    return () => clearInterval(t);
  }, []);

  const triggerXpPop = useCallback((amount: number) => {
    setXpPop(amount);
    setTimeout(() => setXpPop(null), 1200);
  }, []);

  async function build() {
    setLoading(true);
    setData(null);
    setShowConfetti(false);
    try {
      const res = await fetch("/api/workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const d: WorkoutResponse = await res.json();
      setData(d);
      if (d.result) {
        const earned = xpForWorkout(d.result);
        setXp((prev) => prev + earned);
        setBuildCount((prev) => prev + 1);
        setStreak((prev) => prev + 1);
        triggerXpPop(earned);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
        setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      } else {
        setStreak(0);
      }
      loadFeed();
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && request.trim() && !loading) build();
  }

  const lv = levelFromXp(xp);
  const badges = data?.result ? earnBadges(data.result, streak) : [];

  return (
    <main className="wrap">
      <div className="brand">
        <span className="spark" /> QuickFit
      </div>

      {buildCount > 0 && (
        <div className="xp-bar-wrap">
          <div className="xp-bar-header">
            <span className="xp-level">LVL {lv.level}</span>
            <span className="xp-title">{lv.title}</span>
            <span className="xp-count">{xp} XP</span>
          </div>
          <div className="xp-track">
            <div className="xp-fill" style={{ width: `${Math.min(lv.progress, 100)}%` }} />
          </div>
          <div className="xp-stats">
            <span>{buildCount} workout{buildCount !== 1 ? "s" : ""} built</span>
            {streak >= 2 && <span className="streak-badge">🔥 {streak} streak</span>}
          </div>
          {xpPop !== null && <span className="xp-pop">+{xpPop} XP</span>}
        </div>
      )}

      <h1>Tell us what you&apos;ve got. Get a workout you can start right now.</h1>
      <p className="sub">No programs, no quizzes, no gym required. Say your time, energy, and equipment — QuickFit builds one short workout sized to this exact moment.</p>

      <label>What have you got right now?</label>
      <textarea value={request} onChange={(e) => setRequest(e.target.value)} onKeyDown={onKeyDown} placeholder="e.g. 15 minutes, no equipment, low energy — focus on core" />

      <div className="row">
        <button onClick={build} disabled={loading || !request.trim()}>
          {loading ? "Building…" : "Build my workout"}
        </button>
        <span className="hint">⌘↵ to build</span>
      </div>
      <div className="chips">
        {SAMPLES.map((s) => (
          <span key={s} className="chip" onClick={() => setRequest(s)}>{s}</span>
        ))}
      </div>

      {showConfetti && <Confetti />}

      {data && data.result && (
        <div className="card" ref={cardRef}>
          <div className="card-top">
            <div className="field hero">
              <div className="k">Your workout</div>
              <div className="v">{data.result.title}</div>
            </div>
          </div>
          <div className="card-body">
            {badges.length > 0 && (
              <div className="badges">
                {badges.map((b, i) => (
                  <span key={i} className="badge">{b.emoji} {b.label}</span>
                ))}
              </div>
            )}
            <div className="stats">
              <span className="stat"><b>{data.result.durationMin}</b> min</span>
              <span className="stat"><b>{data.result.moves.length}</b> moves</span>
              <span className="stat">{data.result.focus}</span>
            </div>
            <div className="field warm">
              <div className="k">Warm up · 1 min</div>
              <div className="v">{data.result.warmup}</div>
            </div>
            <div className="field">
              <div className="k">The moves</div>
              <ol className="moves">
                {data.result.moves.map((m, i) => (
                  <li key={i} className="move">
                    <span className="move-name">{m.name}</span>
                    <span className="move-detail">{m.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="field coach">
              <div className="k">Coach note</div>
              <div className="v">{data.result.coachNote}</div>
            </div>
            <div className="meta">
              {data.mock && <span className="mock-badge">MOCK MODE</span>}
              <span className="pass">✓ guardrails passed</span>
            </div>
          </div>
        </div>
      )}

      {data && !data.result && (
        <div className="card blocked">
          <div className="card-body">
            <div className="field">
              <div className="k kill-k">⚠ Blocked at {data.blockedAt} · {data.flags.join(", ")}</div>
              <div className="v">{data.safeMessage}</div>
            </div>
          </div>
        </div>
      )}

      <p className="trust">QuickFit suggests general bodyweight workouts — it&apos;s not medical advice. Anything about pain or injury is handed off to a professional.</p>

      <section className="wall">
        <div className="wall-head">
          <h2>Live wall — built in this room</h2>
          <span className="wall-count">{feed.total} workouts</span>
        </div>
        <div className="feed">
          {feed.items.length === 0 ? (
            <div className="feed-empty">Be the first — build a workout above.</div>
          ) : (
            feed.items.map((f) => (
              <div key={f.id} className="feed-item">
                <div className="fi-idea">🏃 {f.request}</div>
                <div className="fi-hyp">{f.title}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
