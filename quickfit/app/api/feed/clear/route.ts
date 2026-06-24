export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { clearWall } from "@/lib/store";

export async function POST() {
  await clearWall();
  return Response.json({ ok: true });
}
