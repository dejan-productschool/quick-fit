// The live wall of audience-generated workouts.
//
// Backed by Vercel KV when its env vars are present (set automatically when you link
// a KV/Upstash store to the project), so the wall is shared across every serverless
// instance — that's what lets a whole conference room write to the same wall.
//
// Falls back to an in-memory array when KV isn't configured, so `npm run dev` and
// offline rehearsal (MOCK_LLM=1, no network) still work with zero setup.

export type WallItem = {
  id: string;
  request: string;
  title: string;
  ts: number;
};

const KEY = "quickfit:wall";
const MAX = 200;

function hasKV(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// ── In-memory fallback (single instance; great for localhost) ──────────────────
const MEM: WallItem[] = [];

export async function addWorkout(entry: Omit<WallItem, "id" | "ts">): Promise<WallItem> {
  const item: WallItem = { ...entry, id: Math.random().toString(36).slice(2, 9), ts: Date.now() };

  if (hasKV()) {
    const { kv } = await import("@vercel/kv");
    // Newest first, capped at MAX.
    await kv.lpush(KEY, item);
    await kv.ltrim(KEY, 0, MAX - 1);
    return item;
  }

  MEM.unshift(item);
  if (MEM.length > MAX) MEM.length = MAX;
  return item;
}

export async function recentWorkouts(limit = 30): Promise<{ items: WallItem[]; total: number }> {
  if (hasKV()) {
    const { kv } = await import("@vercel/kv");
    const [items, total] = await Promise.all([
      kv.lrange<WallItem>(KEY, 0, limit - 1),
      kv.llen(KEY),
    ]);
    return { items: items ?? [], total: total ?? 0 };
  }

  return { items: MEM.slice(0, limit), total: MEM.length };
}

export async function clearWall(): Promise<void> {
  if (hasKV()) {
    const { kv } = await import("@vercel/kv");
    await kv.del(KEY);
    return;
  }
  MEM.length = 0;
}
