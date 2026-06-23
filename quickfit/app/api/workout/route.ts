import { NextRequest, NextResponse } from "next/server";
import { complete, isMockMode } from "@/lib/llm";
import { buildWorkoutPrompt } from "@/lib/workout";
import { checkInput, checkOutput } from "@/lib/guardrails";
import { addWorkout } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { request } = await req.json().catch(() => ({ request: "" }));
  const text = String(request ?? "");

  // 1) INPUT GUARDRAIL.
  const input = checkInput(text);
  if (!input.ok) {
    return NextResponse.json({ blockedAt: "input", flags: input.flags, safeMessage: input.safeMessage, result: null, mock: isMockMode() });
  }

  // 2) GENERATE THE WORKOUT.
  let raw = "";
  try {
    raw = await complete(
      [
        { role: "system", content: buildWorkoutPrompt() },
        { role: "user", content: text },
      ],
      { json: true }
    );
  } catch (err: any) {
    return NextResponse.json({ blockedAt: null, flags: ["llm_error"], safeMessage: "The coach is warming up — try again in a second.", result: null }, { status: 502 });
  }

  // 3) OUTPUT GUARDRAIL.
  const output = checkOutput(raw);
  if (!output.ok) {
    return NextResponse.json({ blockedAt: "output", flags: [...input.flags, ...output.flags], safeMessage: output.safeMessage, result: null, mock: isMockMode() });
  }

  // 4) Record to the live wall.
  await addWorkout({ request: text.slice(0, 140), title: output.result.title });

  return NextResponse.json({ blockedAt: null, flags: [...input.flags, ...output.flags], result: output.result, mock: isMockMode() });
}
