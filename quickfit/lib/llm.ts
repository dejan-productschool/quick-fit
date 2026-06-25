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
  const durationMin = Math.min(Math.max(parseInt(minMatch?.[1] ?? "15", 10) || 15, 4), 90);

  const lowEnergy  = /(low energy|tired|exhausted|drained|sleepy|just woke|groggy|sluggish)/.test(text);
  const highEnergy = /(high energy|energized|fired up|pumped|fresh|strong)/.test(text);
  const energy = lowEnergy ? "low" : highEnergy ? "high" : "moderate";

  // Equipment — order matters: most specific first
  const hasMachine  = /machine|cable|lat pulldown|leg press|seated row|leg curl|chest fly/.test(text);
  const hasBarbell  = /barbell|bar\b|olympic|squat rack/.test(text);
  const hasDumbbell = /dumbbell|dbs?\b|weights?/.test(text);
  const hasKettle   = /kettlebell/.test(text);
  const hasBand     = /resistance band|band/.test(text);
  const hasPullup   = /pull.?up bar/.test(text);
  const hasGym      = hasMachine || hasBarbell; // full gym context

  // Derive a short gear label for the title
  let gearLabel = "No-Gear";
  if (hasMachine && hasBarbell) gearLabel = "Barbell + Machine";
  else if (hasMachine)   gearLabel = "Machine";
  else if (hasBarbell)   gearLabel = "Barbell";
  else if (hasDumbbell)  gearLabel = "Dumbbell";
  else if (hasKettle)    gearLabel = "Kettlebell";
  else if (hasBand)      gearLabel = "Band";

  // Target area — specific muscles first
  let area = "full body";
  if      (/\bback\b|lat\b|lats\b|pull|row|deadlift|rhomboid|trap/.test(text))                         area = "back";
  else if (/chest|pec|bench|push.up/.test(text))                                                        area = "chest";
  else if (/shoulder|delt|overhead|ohp/.test(text))                                                     area = "shoulders";
  else if (/bicep|curl|arm/.test(text))                                                                  area = "arms";
  else if (/tricep/.test(text))                                                                          area = "arms";
  else if (/core|abs|stomach|plank/.test(text))                                                         area = "core";
  else if (/leg|lower|glute|squat|hamstring|quad|hinge/.test(text))                                     area = "legs";
  else if (/cardio|hiit|sweat|conditioning|run/.test(text))                                             area = "cardio";

  // Reps/sets based on energy + time
  const heavy   = energy === "low"  ? "3 × 10 reps" : energy === "high" ? "4 × 6 reps"  : "4 × 8 reps";
  const medium  = energy === "low"  ? "3 × 12 reps" : energy === "high" ? "4 × 10 reps" : "3 × 12 reps";
  const light   = energy === "low"  ? "3 × 15 reps" : energy === "high" ? "4 × 12 reps" : "3 × 15 reps";
  const hold    = energy === "low"  ? "3 × 20s hold" : "3 × 40s hold";
  const circuit = energy === "low"  ? "30s on / 30s rest" : energy === "high" ? "45s on / 15s rest" : "40s on / 20s rest";

  type Move = { name: string; detail: string };
  const library: Record<string, Move[]> = {
    back: hasBarbell ? [
      { name: "Barbell bent-over row",      detail: heavy },
      { name: "Barbell deadlift",           detail: heavy },
      { name: "Barbell Romanian deadlift",  detail: medium },
      { name: hasBarbell ? "Barbell Pendlay row" : "Dumbbell single-arm row", detail: medium },
      { name: "Face pull (band or cable)",  detail: light },
      { name: "Hyperextension / back extension", detail: light },
    ] : hasMachine ? [
      { name: "Lat pulldown (wide grip)",   detail: medium },
      { name: "Seated cable row",           detail: medium },
      { name: "Machine low row",            detail: medium },
      { name: "Single-arm cable pulldown",  detail: light },
      { name: "Cable face pull",            detail: light },
      { name: "Machine back extension",     detail: light },
    ] : hasDumbbell ? [
      { name: "Dumbbell single-arm row",    detail: medium },
      { name: "Dumbbell Romanian deadlift", detail: medium },
      { name: "Renegade row",               detail: light },
      { name: "Dumbbell shrug",             detail: light },
      { name: "Superman hold",              detail: hold },
    ] : [
      { name: "Inverted row (under table)", detail: medium },
      { name: "Superman hold",              detail: hold },
      { name: "Prone Y-T-W",               detail: "2 × 10 each" },
      { name: "Bird dog",                   detail: "10 reps each side" },
      { name: "Dead bug",                   detail: circuit },
    ],

    chest: hasBarbell ? [
      { name: "Barbell bench press",        detail: heavy },
      { name: "Incline barbell press",      detail: medium },
      { name: "Barbell close-grip press",   detail: medium },
      { name: "Dumbbell fly (if available)", detail: light },
      { name: "Push-up (weighted)",         detail: light },
    ] : hasMachine ? [
      { name: "Chest press machine",        detail: medium },
      { name: "Cable chest fly",            detail: medium },
      { name: "Incline machine press",      detail: medium },
      { name: "Push-up",                    detail: light },
    ] : hasDumbbell ? [
      { name: "Dumbbell bench press",       detail: medium },
      { name: "Dumbbell incline press",     detail: medium },
      { name: "Dumbbell fly",               detail: light },
      { name: "Push-up",                    detail: light },
    ] : [
      { name: "Push-up",                    detail: circuit },
      { name: "Wide push-up",               detail: circuit },
      { name: "Diamond push-up",            detail: circuit },
      { name: "Pike push-up",               detail: circuit },
    ],

    shoulders: hasBarbell ? [
      { name: "Barbell overhead press",     detail: heavy },
      { name: "Barbell upright row",        detail: medium },
      { name: "Dumbbell lateral raise",     detail: light },
      { name: "Face pull",                  detail: light },
      { name: "Front plate raise",          detail: light },
    ] : hasDumbbell ? [
      { name: "Dumbbell shoulder press",    detail: medium },
      { name: "Lateral raise",              detail: light },
      { name: "Front raise",                detail: light },
      { name: "Arnold press",               detail: medium },
      { name: "Rear delt fly",              detail: light },
    ] : [
      { name: "Pike push-up",               detail: circuit },
      { name: "Wall handstand hold",        detail: hold },
      { name: "Prone Y-T-W",               detail: "2 × 10 each" },
      { name: "Band pull-apart",            detail: light },
    ],

    arms: hasDumbbell || hasBarbell ? [
      { name: hasBarbell ? "Barbell bicep curl" : "Dumbbell curl",      detail: medium },
      { name: hasBarbell ? "EZ-bar skull crusher" : "Dumbbell overhead tricep extension", detail: medium },
      { name: "Hammer curl",               detail: light },
      { name: "Tricep kickback",            detail: light },
      { name: "Concentration curl",         detail: light },
    ] : [
      { name: "Chin-up (or band-assisted)", detail: medium },
      { name: "Diamond push-up",           detail: circuit },
      { name: "Bodyweight tricep dip",     detail: circuit },
      { name: "Isometric curl (door frame)", detail: hold },
    ],

    core: [
      { name: "Dead bug",                  detail: circuit },
      { name: "Forearm plank",             detail: hold },
      { name: "Bird dog",                  detail: "10 reps each side" },
      { name: "Hanging knee raise (or lying leg raise)", detail: medium },
      { name: "Pallof press (band/cable)", detail: "3 × 10 each side" },
      { name: "Ab wheel rollout",          detail: light },
    ],

    legs: hasBarbell ? [
      { name: "Barbell back squat",        detail: heavy },
      { name: "Barbell Romanian deadlift", detail: medium },
      { name: "Barbell walking lunge",     detail: medium },
      { name: "Barbell hip thrust",        detail: medium },
      { name: "Calf raise (barbell on back)", detail: light },
    ] : hasMachine ? [
      { name: "Leg press",                 detail: medium },
      { name: "Leg curl (lying or seated)", detail: medium },
      { name: "Leg extension",             detail: light },
      { name: "Hip abductor machine",      detail: light },
      { name: "Calf raise machine",        detail: light },
    ] : hasDumbbell ? [
      { name: "Goblet squat",              detail: medium },
      { name: "Dumbbell Romanian deadlift", detail: medium },
      { name: "Reverse lunge",             detail: "10 reps each side" },
      { name: "Dumbbell hip thrust",       detail: medium },
      { name: "Calf raise",               detail: light },
    ] : [
      { name: "Bodyweight squat",          detail: circuit },
      { name: "Reverse lunge",             detail: "10 reps each side" },
      { name: "Glute bridge",              detail: "15 reps" },
      { name: "Wall sit",                  detail: hold },
      { name: "Calf raise",               detail: light },
    ],

    cardio: [
      { name: "Jumping jacks",             detail: circuit },
      { name: "High knees",                detail: circuit },
      { name: "Mountain climbers",         detail: circuit },
      { name: "Squat jump",                detail: circuit },
      { name: "Burpee",                    detail: circuit },
    ],

    "full body": hasBarbell ? [
      { name: "Barbell deadlift",          detail: heavy },
      { name: "Barbell bent-over row",     detail: medium },
      { name: "Barbell overhead press",    detail: medium },
      { name: "Barbell front squat",       detail: medium },
      { name: "Push-up",                   detail: light },
    ] : hasDumbbell ? [
      { name: "Dumbbell Romanian deadlift", detail: medium },
      { name: "Dumbbell row",              detail: medium },
      { name: "Dumbbell press",            detail: medium },
      { name: "Goblet squat",              detail: medium },
      { name: "Farmer carry (20m)",        detail: "3 × 20m" },
    ] : [
      { name: "Squat",                     detail: circuit },
      { name: "Push-up",                   detail: circuit },
      { name: "Reverse lunge",             detail: "8 reps each side" },
      { name: "Plank shoulder taps",       detail: "30s" },
      { name: "Glute bridge",              detail: "15 reps" },
    ],
  };

  // Scale move count to session length
  const moveCount = Math.min(Math.max(Math.round(durationMin / (hasGym ? 10 : 4)), 3), 6);
  const moves = (library[area] ?? library["full body"]).slice(0, moveCount);

  // Warmup specific to area
  const warmups: Record<string, string> = {
    back: "5 min: cat-cow × 10, band pull-apart × 15, scapular retractions × 10, light row warm-up set.",
    chest: "5 min: arm circles, shoulder CARs × 5 each, push-up warm-up sets, rotator cuff stretch.",
    shoulders: "5 min: arm circles, band pull-apart × 15, shoulder CARs, light press warm-up set.",
    arms: "5 min: arm circles, wrist circles, light curl warm-up set, tricep stretch.",
    legs: "5 min: hip circles, leg swings, bodyweight squat × 10, hip flexor stretch.",
    core: "3 min: pelvic tilts × 10, dead bug practice × 5 each, hip circles.",
    cardio: "3 min: march in place, hip circles, leg swings, arm swings.",
    "full body": "5 min: arm circles, hip circles, bodyweight squat × 8, push-up × 5.",
  };

  const coachNotes: Record<string, string> = {
    back: "On every row: retract your scapula first, then pull — don't let your arms lead. Control the return.",
    chest: "Lower the bar/dumbbells slowly (3 seconds down), pause at the bottom, press explosively.",
    shoulders: "Press strictly — no lower-back lean. If you have to arch, drop the weight.",
    arms: "Full range of motion beats heavy and sloppy. Squeeze at the top of every curl; lock out every tricep extension.",
    legs: "Brace your core before each rep. On the squat, knees track over toes — don't let them cave.",
    core: "Every rep is controlled. If your lower back lifts off the floor, you've gone too far — reset.",
    cardio: "Stay light on your feet. If your form breaks, slow down — don't just push through.",
    "full body": "Compound lifts first, smaller muscles last. Rest 90s between heavy sets.",
  };

  const rounds = durationMin <= 15 ? 2 : durationMin <= 30 ? 3 : durationMin <= 45 ? 4 : 5;
  const energyWord = energy === "low" ? "low-intensity" : energy === "high" ? "high-intensity" : "moderate";
  const areaTitle = area === "full body" ? "Full Body" : area[0].toUpperCase() + area.slice(1);

  return {
    title: `${durationMin}-Minute ${gearLabel} ${areaTitle} ${energy === "low" ? "Session" : "Workout"}`,
    focus: `${areaTitle} · ${energyWord} · ${gearLabel.toLowerCase()}`,
    durationMin,
    warmup: warmups[area] ?? warmups["full body"],
    moves,
    coachNote: (coachNotes[area] ?? coachNotes["full body"]) + (rounds > 3 ? ` ${rounds} rounds total.` : ""),
  };
}
