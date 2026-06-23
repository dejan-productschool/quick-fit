// Provider-agnostic LLM client with a built-in mock mode.
// Mock mode means the research synthesis, the forge tool, AND the eval suite all run
// with zero network and zero keys — the single most important safety net for a live stage.

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function isMockMode(): boolean {
  return process.env.MOCK_LLM === "1" || !process.env.OPENAI_API_KEY;
}

export async function complete(messages: ChatMessage[], opts: { json?: boolean } = {}): Promise<string> {
  if (isMockMode()) return mockComplete(messages);

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 600,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Deterministic offline responses ───────────────────────────────────────────
function mockComplete(messages: ChatMessage[]): string {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.find((m) => m.role === "user")?.content ?? "";

  // 1) RESEARCH SYNTHESIS — clusters transcripts into themes + a candidate hypothesis.
  if (/research synthes|cluster|interview transcripts/i.test(system)) {
    return JSON.stringify(
      {
        themes: [
          { name: "Deciding what to do burns the whole session", weight: 6, quoteIds: ["int-01", "int-03", "int-06"] },
          { name: "Generic plans don't fit real time, energy, or equipment", weight: 5, quoteIds: ["int-02", "int-04", "int-07"] },
          { name: "Starting friction is the real battle, not motivation", weight: 3, quoteIds: ["int-05", "int-08"] },
        ],
        topPain:
          "People genuinely want to move, but the moment they get a free 15 minutes they waste it deciding what to do — so they end up doing nothing.",
        candidateHypothesis:
          "We believe busy people will work out more often if they can get a workout tailored to the exact time, energy, and equipment they have in under 10 seconds, because their real blocker is decision friction, not motivation. We'll know we're right if a meaningful share of people who try it generate a workout and start it on their first session.",
        riskiestAssumption: "That decision friction — not motivation or time itself — is the true blocker, so removing the 'what do I do?' step actually changes behavior.",
      },
      null,
      2
    );
  }

  // 2) WORKOUT — turn the user's time/energy/equipment into one ready-to-start workout.
  if (/quickfit|instant workout|workout generator/i.test(system)) {
    return JSON.stringify(mockWorkout(user));
  }

  return "{}";
}

// Deterministic workout that visibly adapts to what the user typed — so the live
// demo feels responsive (different inputs => different workouts) with zero network.
function mockWorkout(input: string) {
  const text = input.toLowerCase();

  const minMatch = text.match(/(\d{1,3})\s*(min|minute|m\b)/) ?? text.match(/\b(\d{1,3})\b/);
  const durationMin = Math.min(Math.max(parseInt(minMatch?.[1] ?? "15", 10) || 15, 4), 60);

  const lowEnergy = /(low energy|tired|exhausted|drained|sleepy|just woke|groggy|sluggish)/.test(text);
  const highEnergy = /(high energy|energized|fired up|pumped|fresh|strong)/.test(text);
  const energy = lowEnergy ? "low" : highEnergy ? "high" : "moderate";

  let equipment = "no equipment";
  if (/dumbbell|weights?/.test(text)) equipment = "dumbbells";
  else if (/kettlebell/.test(text)) equipment = "a kettlebell";
  else if (/band/.test(text)) equipment = "a resistance band";
  else if (/chair/.test(text)) equipment = "a chair";

  let area = "full body";
  if (/core|abs|stomach/.test(text)) area = "core";
  else if (/leg|lower|glute|squat/.test(text)) area = "legs";
  else if (/upper|arm|chest|push|pull/.test(text)) area = "upper body";
  else if (/cardio|hiit|sweat|conditioning|run/.test(text)) area = "cardio";

  const work = energy === "low" ? "30s on / 30s rest" : energy === "high" ? "45s on / 15s rest" : "40s on / 20s rest";

  const library: Record<string, { name: string; detail: string }[]> = {
    core: [
      { name: "Dead bug", detail: work },
      { name: "Forearm plank", detail: energy === "low" ? "3 × 20s hold" : "3 × 40s hold" },
      { name: "Bird dog", detail: "10 reps each side" },
      { name: "Slow bicycle crunch", detail: work },
      { name: "Glute bridge hold", detail: "3 × 30s" },
    ],
    legs: [
      { name: equipment === "dumbbells" ? "Goblet squat" : "Bodyweight squat", detail: work },
      { name: "Reverse lunge", detail: "10 reps each side" },
      { name: "Glute bridge", detail: "15 reps" },
      { name: "Calf raise", detail: "20 reps" },
      { name: "Wall sit", detail: energy === "low" ? "3 × 20s" : "3 × 45s" },
    ],
    "upper body": [
      { name: equipment === "dumbbells" ? "Dumbbell press" : "Push-up (knees ok)", detail: work },
      { name: equipment === "a resistance band" ? "Band row" : "Pike push-up", detail: work },
      { name: "Superman hold", detail: "3 × 20s" },
      { name: "Shoulder taps", detail: "30s" },
    ],
    cardio: [
      { name: "Jumping jacks", detail: work },
      { name: "High knees", detail: work },
      { name: "Mountain climbers", detail: work },
      { name: "Squat to reach", detail: work },
      { name: "Fast feet", detail: "30s" },
    ],
    "full body": [
      { name: equipment === "dumbbells" ? "Goblet squat" : "Squat", detail: work },
      { name: "Push-up (knees ok)", detail: work },
      { name: "Reverse lunge", detail: "8 reps each side" },
      { name: "Plank shoulder taps", detail: "30s" },
      { name: "Glute bridge", detail: "15 reps" },
    ],
  };

  // Scale move count to time: ~1 move per 3 minutes, clamped to 3-6.
  const moveCount = Math.min(Math.max(Math.round(durationMin / 3), 3), 6);
  const moves = (library[area] ?? library["full body"]).slice(0, moveCount);

  const rounds = durationMin <= 10 ? 2 : durationMin <= 20 ? 3 : 4;
  const energyWord = energy === "low" ? "gentle" : energy === "high" ? "high-intensity" : "balanced";
  const gearWord = equipment === "no equipment" ? "no-gear" : equipment.replace(/^a /, "");

  return {
    title: `${durationMin}-Minute ${gearWord} ${area} ${energy === "low" ? "reset" : "burner"}`.replace(/\b\w/g, (c) => c.toUpperCase()),
    focus: `${area[0].toUpperCase()}${area.slice(1)} · ${energyWord} · ${equipment}`,
    durationMin,
    warmup: "60 seconds easy: arm circles, hip openers, and a few slow squats to wake everything up.",
    moves,
    coachNote: `Run ${rounds} rounds. ${energy === "low" ? "Keep it smooth and breathe — stop early if anything feels off." : "Push the work intervals; rest fully so each round stays strong."} Make it easier by shortening work intervals.`,
  };
}
