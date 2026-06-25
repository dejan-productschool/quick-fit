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

  const lowEnergy  = /(low energy|tired|exhausted|drained|sleepy|just woke|groggy|sluggish|recovery|rest day)/.test(text);
  const highEnergy = /(high energy|energized|fired up|pumped|fresh|strong|max effort|beast)/.test(text);
  const energy = lowEnergy ? "low" : highEnergy ? "high" : "moderate";

  // ── Equipment detection ───────────────────────────────────────────────────
  const hasBarbell    = /barbell|bar\b|olympic|squat rack|ez.?bar/.test(text);
  const hasMachine    = /machine|cable|lat pulldown|leg press|seated row|leg curl|chest fly|smith machine/.test(text);
  const hasDumbbell   = /dumbbell|dbs?\b|db\b/.test(text);
  const hasKettle     = /kettlebell|kb\b/.test(text);
  const hasBand       = /resistance band|\bband\b|theraband/.test(text);
  const hasPullupBar  = /pull.?up bar|pull-up bar/.test(text);
  const hasRings      = /rings|trx|suspension/.test(text);
  const hasDipBar     = /dip bar|parallel bar/.test(text);
  const isOutdoor     = /outdoor|outside|park|street workout|playground|calisthenics park/.test(text);
  const isCalisthenics = /calisthenics|bodyweight only|no equipment|no gear/.test(text);
  const hasGym        = hasBarbell || hasMachine;
  // Outdoor parks typically have pull-up bars, parallel bars, and benches
  const hasBars       = hasPullupBar || hasRings || hasDipBar || isOutdoor;

  // ── Gear label for title ──────────────────────────────────────────────────
  let gearLabel = "Bodyweight";
  if (hasBarbell && hasMachine) gearLabel = "Barbell + Cable";
  else if (hasBarbell)   gearLabel = "Barbell";
  else if (hasMachine)   gearLabel = "Cable & Machine";
  else if (hasDumbbell)  gearLabel = "Dumbbell";
  else if (hasKettle)    gearLabel = "Kettlebell";
  else if (hasBand)      gearLabel = "Resistance Band";
  else if (hasRings)     gearLabel = "Rings";
  else if (isOutdoor)    gearLabel = "Outdoor";
  else if (isCalisthenics) gearLabel = "Calisthenics";

  // ── Area detection — most specific first ─────────────────────────────────
  let area = "full body";
  if      (/\bback\b|lat\b|lats\b|rhomboid|trap|deadlift/.test(text) && !/push day|chest/.test(text))   area = "back";
  else if (/chest|pec|bench/.test(text))                                                                  area = "chest";
  else if (/shoulder|delt|\bohp\b|overhead press/.test(text))                                            area = "shoulders";
  else if (/bicep|biceps/.test(text))                                                                    area = "biceps";
  else if (/tricep|triceps/.test(text))                                                                  area = "triceps";
  else if (/\barms?\b/.test(text) && !/(legs?|back|chest|shoulder)/.test(text))                         area = "arms";
  else if (/glute|butt|booty|hip thrust/.test(text))                                                    area = "glutes";
  else if (/core|abs|stomach|six.?pack|hollow/.test(text))                                              area = "core";
  else if (/\blegs?\b|quad|hamstring|squat day|lower body/.test(text))                                  area = "legs";
  else if (/push day|push workout/.test(text))                                                           area = "push";
  else if (/pull day|pull workout/.test(text))                                                           area = "pull";
  else if (/upper body|upper split/.test(text))                                                          area = "upper";
  else if (/lower body|lower split/.test(text))                                                          area = "lower";
  else if (/cardio|hiit|conditioning|fat burn|sweat|run|sprint/.test(text))                             area = "cardio";
  else if (/mobility|stretch|flexibility|yoga|recovery|cool.?down/.test(text))                          area = "mobility";
  else if (isCalisthenics && !/(back|chest|leg|core|arm)/.test(text))                                   area = "calisthenics";
  else if (isOutdoor && !/(back|chest|leg|core|arm)/.test(text))                                        area = "outdoor";

  // ── Rep / time templates ──────────────────────────────────────────────────
  const S = {
    heavy:   energy === "low" ? "3 × 10 reps" : energy === "high" ? "5 × 5 reps"   : "4 × 6 reps",
    medium:  energy === "low" ? "3 × 12 reps" : energy === "high" ? "4 × 8 reps"   : "4 × 10 reps",
    light:   energy === "low" ? "3 × 15 reps" : energy === "high" ? "4 × 12 reps"  : "3 × 15 reps",
    hold:    energy === "low" ? "3 × 20s hold" : energy === "high" ? "4 × 45s hold" : "3 × 35s hold",
    circuit: energy === "low" ? "30s on / 30s rest" : energy === "high" ? "45s on / 15s rest" : "40s on / 20s rest",
    isoCurl: energy === "low" ? "3 × 10 reps each" : "3 × 12 reps each",
  };

  type Move = { name: string; detail: string };

  // ── Exercise library ──────────────────────────────────────────────────────
  // Each area has equipment-priority branches. First match wins.
  function pickMoves(a: string): Move[] {
    switch (a) {

      // ── BACK ──────────────────────────────────────────────────────────────
      case "back":
        if (hasBarbell) return [
          { name: "Barbell bent-over row",           detail: S.heavy },
          { name: "Barbell deadlift",                detail: S.heavy },
          { name: "Barbell Romanian deadlift",       detail: S.medium },
          { name: "Barbell Pendlay row",             detail: S.medium },
          { name: "Face pull (band or cable)",       detail: S.light },
          { name: "Hyperextension",                  detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Lat pulldown — wide grip",        detail: S.medium },
          { name: "Seated cable row",                detail: S.medium },
          { name: "Single-arm cable pulldown",       detail: S.light },
          { name: "Cable face pull",                 detail: S.light },
          { name: "Machine low row",                 detail: S.medium },
          { name: "Hyperextension machine",          detail: S.light },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell single-arm row",         detail: S.medium },
          { name: "Dumbbell Romanian deadlift",      detail: S.medium },
          { name: "Renegade row",                    detail: S.light },
          { name: "Dumbbell shrug",                  detail: S.light },
          { name: "Prone dumbbell Y-T-W",            detail: "2 × 10 each shape" },
        ];
        if (hasKettle) return [
          { name: "Kettlebell swing",                detail: S.medium },
          { name: "Kettlebell single-arm row",       detail: S.medium },
          { name: "Kettlebell Romanian deadlift",    detail: S.medium },
          { name: "Kettlebell high pull",            detail: S.light },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Pull-up (or jumping pull-up)",    detail: S.medium },
          { name: "Chin-up",                         detail: S.medium },
          { name: "Inverted row (low bar)",          detail: S.medium },
          { name: "Hanging scapular depression",     detail: S.hold },
          { name: "Prone Y-T-W",                     detail: "2 × 10 each shape" },
        ];
        if (hasBand) return [
          { name: "Band pull-apart",                 detail: S.light },
          { name: "Band face pull",                  detail: S.light },
          { name: "Band seated row",                 detail: S.medium },
          { name: "Band single-arm row",             detail: S.medium },
          { name: "Superman hold",                   detail: S.hold },
        ];
        return [ // pure bodyweight
          { name: "Inverted row (under table/bar)",  detail: S.medium },
          { name: "Superman hold",                   detail: S.hold },
          { name: "Prone Y-T-W",                     detail: "2 × 10 each shape" },
          { name: "Bird dog",                        detail: "12 reps each side" },
          { name: "Scapular push-up",                detail: S.light },
        ];

      // ── CHEST ─────────────────────────────────────────────────────────────
      case "chest":
        if (hasBarbell) return [
          { name: "Barbell bench press",             detail: S.heavy },
          { name: "Incline barbell press",           detail: S.medium },
          { name: "Close-grip bench press",          detail: S.medium },
          { name: "Dumbbell fly (if available)",     detail: S.light },
          { name: "Push-up — paused at bottom",      detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Chest press machine",             detail: S.medium },
          { name: "Incline machine press",           detail: S.medium },
          { name: "Cable chest fly (low to high)",   detail: S.light },
          { name: "Cable chest fly (high to low)",   detail: S.light },
          { name: "Push-up — weighted plate",        detail: S.light },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell flat bench press",       detail: S.medium },
          { name: "Dumbbell incline press",          detail: S.medium },
          { name: "Dumbbell chest fly",              detail: S.light },
          { name: "Dumbbell pullover",               detail: S.light },
          { name: "Push-up",                         detail: S.light },
        ];
        if (hasKettle) return [
          { name: "Kettlebell floor press",          detail: S.medium },
          { name: "Single-arm KB floor press",       detail: S.medium },
          { name: "Push-up",                         detail: S.circuit },
          { name: "Kettlebell crush press",          detail: S.light },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Wide push-up",                    detail: S.circuit },
          { name: "Archer push-up",                  detail: S.light },
          { name: "Ring push-up (or feet elevated)", detail: S.medium },
          { name: "Pseudo planche push-up",          detail: S.light },
        ];
        if (hasBand) return [
          { name: "Band chest press (anchored)",     detail: S.medium },
          { name: "Band chest fly",                  detail: S.light },
          { name: "Push-up with band over back",     detail: S.medium },
          { name: "Band floor press",                detail: S.medium },
        ];
        return [
          { name: "Push-up",                         detail: S.circuit },
          { name: "Wide push-up",                    detail: S.circuit },
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Pike push-up",                    detail: S.circuit },
          { name: "Decline push-up (feet on chair)", detail: S.light },
        ];

      // ── SHOULDERS ─────────────────────────────────────────────────────────
      case "shoulders":
        if (hasBarbell) return [
          { name: "Barbell overhead press (standing)", detail: S.heavy },
          { name: "Barbell upright row",             detail: S.medium },
          { name: "Barbell push press",              detail: S.medium },
          { name: "Dumbbell lateral raise",          detail: S.light },
          { name: "Cable / band face pull",          detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Machine shoulder press",          detail: S.medium },
          { name: "Cable lateral raise",             detail: S.light },
          { name: "Cable front raise",               detail: S.light },
          { name: "Cable face pull",                 detail: S.light },
          { name: "Rear delt fly machine",           detail: S.light },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell overhead press",         detail: S.medium },
          { name: "Arnold press",                    detail: S.medium },
          { name: "Lateral raise",                   detail: S.light },
          { name: "Front raise",                     detail: S.light },
          { name: "Rear delt fly (bent over)",       detail: S.light },
        ];
        if (hasKettle) return [
          { name: "Kettlebell press (strict)",       detail: S.medium },
          { name: "KB lateral raise",                detail: S.light },
          { name: "KB halo",                         detail: "3 × 10 each direction" },
          { name: "KB upright row",                  detail: S.medium },
        ];
        if (hasBand) return [
          { name: "Band overhead press",             detail: S.medium },
          { name: "Band lateral raise",              detail: S.light },
          { name: "Band face pull",                  detail: S.light },
          { name: "Band pull-apart",                 detail: S.light },
        ];
        return [
          { name: "Pike push-up",                    detail: S.circuit },
          { name: "Wall handstand hold",             detail: S.hold },
          { name: "Prone Y-T-W",                     detail: "2 × 10 each shape" },
          { name: "Lateral raise (water bottles)",   detail: S.light },
          { name: "Bear crawl (5m forward + back)",  detail: "3 × 5m" },
        ];

      // ── BICEPS ────────────────────────────────────────────────────────────
      case "biceps":
        if (hasBarbell) return [
          { name: "Barbell bicep curl (standing)",   detail: S.medium },
          { name: "EZ-bar preacher curl",            detail: S.medium },
          { name: "Barbell reverse curl",            detail: S.light },
          { name: "Dumbbell hammer curl",            detail: S.isoCurl },
          { name: "Concentration curl",              detail: S.isoCurl },
        ];
        if (hasMachine) return [
          { name: "Cable bicep curl (straight bar)", detail: S.medium },
          { name: "Cable hammer curl (rope)",        detail: S.medium },
          { name: "Cable concentration curl",        detail: S.isoCurl },
          { name: "Machine preacher curl",           detail: S.medium },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell bicep curl",             detail: S.isoCurl },
          { name: "Hammer curl",                     detail: S.isoCurl },
          { name: "Incline dumbbell curl",           detail: S.isoCurl },
          { name: "Concentration curl",              detail: S.isoCurl },
          { name: "Cross-body curl",                 detail: S.isoCurl },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Chin-up",                         detail: S.medium },
          { name: "Close-grip chin-up",              detail: S.medium },
          { name: "Dead hang (grip + forearms)",     detail: S.hold },
          { name: "Band-assisted chin-up",           detail: S.light },
        ];
        if (hasBand) return [
          { name: "Band bicep curl",                 detail: S.medium },
          { name: "Band hammer curl",                detail: S.medium },
          { name: "Band reverse curl",               detail: S.light },
        ];
        return [
          { name: "Chin-up (or negative)",           detail: S.medium },
          { name: "Inverted row — supinated grip",   detail: S.medium },
          { name: "Isometric curl (door frame)",     detail: S.hold },
        ];

      // ── TRICEPS ───────────────────────────────────────────────────────────
      case "triceps":
        if (hasBarbell) return [
          { name: "Close-grip bench press",          detail: S.heavy },
          { name: "EZ-bar skull crusher",            detail: S.medium },
          { name: "Barbell overhead tricep extension", detail: S.medium },
          { name: "Tricep dip (weighted if possible)", detail: S.medium },
          { name: "Push-down (band or cable)",       detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Cable tricep pushdown (straight bar)", detail: S.medium },
          { name: "Cable overhead extension (rope)", detail: S.medium },
          { name: "Cable single-arm pushdown",       detail: S.isoCurl },
          { name: "Machine tricep dip",              detail: S.medium },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell overhead tricep extension", detail: S.medium },
          { name: "Dumbbell skull crusher",          detail: S.medium },
          { name: "Tricep kickback",                 detail: S.isoCurl },
          { name: "Close-grip dumbbell press",       detail: S.medium },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Bench dip",                       detail: S.medium },
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Pike push-up lockout",            detail: S.light },
        ];
        if (hasBand) return [
          { name: "Band tricep pushdown",            detail: S.medium },
          { name: "Band overhead extension",         detail: S.medium },
          { name: "Band skull crusher",              detail: S.medium },
        ];
        return [
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Bench dip / chair dip",           detail: S.medium },
          { name: "Pike push-up",                    detail: S.circuit },
          { name: "Tricep push-up (elbows close)",   detail: S.circuit },
        ];

      // ── ARMS (biceps + triceps together) ──────────────────────────────────
      case "arms":
        if (hasBarbell || hasDumbbell) return [
          { name: hasBarbell ? "Barbell bicep curl" : "Dumbbell curl", detail: S.medium },
          { name: hasBarbell ? "EZ-bar skull crusher" : "Overhead tricep extension", detail: S.medium },
          { name: "Hammer curl",                     detail: S.isoCurl },
          { name: "Tricep kickback",                 detail: S.isoCurl },
          { name: "Concentration curl",              detail: S.isoCurl },
          { name: "Diamond push-up",                 detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Cable bicep curl",                detail: S.medium },
          { name: "Cable tricep pushdown (rope)",    detail: S.medium },
          { name: "Cable hammer curl",               detail: S.medium },
          { name: "Cable overhead extension",        detail: S.medium },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Chin-up",                         detail: S.medium },
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Close-grip chin-up",              detail: S.medium },
          { name: "Diamond push-up",                 detail: S.circuit },
        ];
        return [
          { name: "Chin-up (or negative)",           detail: S.medium },
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Bench dip",                       detail: S.medium },
          { name: "Isometric curl",                  detail: S.hold },
        ];

      // ── GLUTES ────────────────────────────────────────────────────────────
      case "glutes":
        if (hasBarbell) return [
          { name: "Barbell hip thrust",              detail: S.heavy },
          { name: "Barbell Romanian deadlift",       detail: S.medium },
          { name: "Barbell sumo deadlift",           detail: S.medium },
          { name: "Barbell walking lunge",           detail: S.medium },
          { name: "45° back extension",              detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Hip thrust machine / glute drive", detail: S.medium },
          { name: "Cable pull-through",              detail: S.medium },
          { name: "Hip abductor machine",            detail: S.light },
          { name: "Leg press — high + wide foot",   detail: S.medium },
          { name: "Hyperextension",                  detail: S.light },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell hip thrust (on bench)",  detail: S.medium },
          { name: "Dumbbell Romanian deadlift",      detail: S.medium },
          { name: "Bulgarian split squat (DB)",      detail: S.medium },
          { name: "Dumbbell curtsy lunge",           detail: S.isoCurl },
          { name: "Glute bridge — 3s pause",         detail: S.light },
        ];
        if (hasKettle) return [
          { name: "Kettlebell swing",                detail: S.medium },
          { name: "Kettlebell single-leg deadlift",  detail: S.isoCurl },
          { name: "KB sumo deadlift",                detail: S.medium },
          { name: "KB hip hinge to good morning",    detail: S.light },
        ];
        if (hasBand) return [
          { name: "Banded glute bridge",             detail: S.medium },
          { name: "Banded hip thrust",               detail: S.medium },
          { name: "Banded lateral walk",             detail: "3 × 15 steps each way" },
          { name: "Banded clamshell",                detail: S.isoCurl },
          { name: "Banded kickback",                 detail: S.isoCurl },
        ];
        return [
          { name: "Glute bridge — 3s pause at top", detail: S.medium },
          { name: "Single-leg glute bridge",         detail: S.isoCurl },
          { name: "Donkey kick",                     detail: S.isoCurl },
          { name: "Fire hydrant",                    detail: S.isoCurl },
          { name: "Frog pump",                       detail: S.light },
          { name: "Step-up (use stairs or bench)",   detail: S.isoCurl },
        ];

      // ── CORE ──────────────────────────────────────────────────────────────
      case "core":
        if (hasBarbell || hasDumbbell) return [
          { name: "Ab wheel rollout",                detail: S.medium },
          { name: "Pallof press (cable or band)",    detail: "3 × 10 each side" },
          { name: "Weighted plank",                  detail: S.hold },
          { name: "Dumbbell Russian twist",          detail: S.medium },
          { name: "Cable wood chop",                 detail: "3 × 10 each side" },
          { name: "Hanging knee raise",              detail: S.medium },
        ];
        if (hasMachine) return [
          { name: "Cable crunch (kneeling)",         detail: S.medium },
          { name: "Pallof press",                    detail: "3 × 10 each side" },
          { name: "Cable wood chop",                 detail: "3 × 10 each side" },
          { name: "Ab machine",                      detail: S.medium },
          { name: "Hanging leg raise",               detail: S.medium },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Hanging knee raise",              detail: S.medium },
          { name: "Hanging leg raise (straight)",    detail: S.medium },
          { name: "Toes to bar",                     detail: S.light },
          { name: "L-sit hold",                      detail: S.hold },
          { name: "Hollow body hold",                detail: S.hold },
        ];
        return [
          { name: "Dead bug",                        detail: S.circuit },
          { name: "Hollow body hold",                detail: S.hold },
          { name: "Forearm plank",                   detail: S.hold },
          { name: "Bird dog",                        detail: "12 reps each side" },
          { name: "Bicycle crunch — slow",           detail: S.circuit },
          { name: "Side plank",                      detail: S.hold },
        ];

      // ── LEGS ──────────────────────────────────────────────────────────────
      case "legs":
        if (hasBarbell) return [
          { name: "Barbell back squat",              detail: S.heavy },
          { name: "Barbell Romanian deadlift",       detail: S.medium },
          { name: "Barbell walking lunge",           detail: S.medium },
          { name: "Barbell hip thrust",              detail: S.medium },
          { name: "Barbell calf raise",              detail: S.light },
          { name: "Barbell pause squat",             detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Leg press",                       detail: S.medium },
          { name: "Lying leg curl",                  detail: S.medium },
          { name: "Leg extension",                   detail: S.light },
          { name: "Hip thrust / glute drive machine", detail: S.medium },
          { name: "Calf raise machine",              detail: S.light },
          { name: "Adductor / abductor machine",     detail: S.light },
        ];
        if (hasDumbbell) return [
          { name: "Goblet squat",                    detail: S.medium },
          { name: "Dumbbell Romanian deadlift",      detail: S.medium },
          { name: "Bulgarian split squat (DB)",      detail: S.medium },
          { name: "Dumbbell hip thrust",             detail: S.medium },
          { name: "Calf raise",                      detail: S.light },
        ];
        if (hasKettle) return [
          { name: "Kettlebell goblet squat",         detail: S.medium },
          { name: "Kettlebell swing",                detail: S.medium },
          { name: "Kettlebell single-leg deadlift",  detail: S.isoCurl },
          { name: "KB sumo deadlift",                detail: S.medium },
          { name: "KB lunge",                        detail: S.isoCurl },
        ];
        if (hasBand) return [
          { name: "Banded squat",                    detail: S.medium },
          { name: "Banded Romanian deadlift",        detail: S.medium },
          { name: "Banded lateral walk",             detail: "3 × 15 steps each way" },
          { name: "Banded glute bridge",             detail: S.medium },
          { name: "Banded calf raise",               detail: S.light },
        ];
        return [
          { name: "Jump squat",                      detail: S.circuit },
          { name: "Reverse lunge",                   detail: "12 reps each side" },
          { name: "Single-leg Romanian deadlift",    detail: S.isoCurl },
          { name: "Wall sit",                        detail: S.hold },
          { name: "Calf raise",                      detail: S.light },
          { name: "Lateral lunge",                   detail: "10 reps each side" },
        ];

      // ── PUSH DAY (chest + shoulders + triceps) ────────────────────────────
      case "push":
        if (hasBarbell) return [
          { name: "Barbell bench press",             detail: S.heavy },
          { name: "Barbell overhead press",          detail: S.medium },
          { name: "Incline barbell press",           detail: S.medium },
          { name: "Close-grip bench press",          detail: S.medium },
          { name: "Dumbbell lateral raise",          detail: S.light },
        ];
        if (hasDumbbell || hasMachine) return [
          { name: hasDumbbell ? "Dumbbell flat press" : "Chest press machine", detail: S.medium },
          { name: hasDumbbell ? "Dumbbell shoulder press" : "Machine shoulder press", detail: S.medium },
          { name: hasDumbbell ? "Incline dumbbell press" : "Incline machine press", detail: S.medium },
          { name: "Lateral raise",                   detail: S.light },
          { name: hasDumbbell ? "Overhead tricep extension" : "Cable pushdown", detail: S.medium },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Pike push-up",                    detail: S.circuit },
          { name: "Wide push-up",                    detail: S.circuit },
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Handstand wall hold",             detail: S.hold },
        ];
        return [
          { name: "Push-up",                         detail: S.circuit },
          { name: "Pike push-up",                    detail: S.circuit },
          { name: "Wide push-up",                    detail: S.circuit },
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Decline push-up",                 detail: S.light },
        ];

      // ── PULL DAY (back + biceps) ───────────────────────────────────────────
      case "pull":
        if (hasBarbell) return [
          { name: "Barbell deadlift",                detail: S.heavy },
          { name: "Barbell bent-over row",           detail: S.heavy },
          { name: "Barbell Romanian deadlift",       detail: S.medium },
          { name: "Barbell bicep curl",              detail: S.medium },
          { name: "Face pull (band or cable)",       detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Lat pulldown (wide grip)",        detail: S.medium },
          { name: "Seated cable row",                detail: S.medium },
          { name: "Cable bicep curl",                detail: S.medium },
          { name: "Cable face pull",                 detail: S.light },
          { name: "Single-arm cable pulldown",       detail: S.light },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell Romanian deadlift",      detail: S.medium },
          { name: "Dumbbell single-arm row",         detail: S.medium },
          { name: "Dumbbell bicep curl",             detail: S.isoCurl },
          { name: "Renegade row",                    detail: S.light },
          { name: "Hammer curl",                     detail: S.isoCurl },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Pull-up",                         detail: S.medium },
          { name: "Chin-up",                         detail: S.medium },
          { name: "Inverted row",                    detail: S.medium },
          { name: "Dead hang",                       detail: S.hold },
          { name: "Scapular pull-up",                detail: S.light },
        ];
        return [
          { name: "Inverted row",                    detail: S.medium },
          { name: "Superman hold",                   detail: S.hold },
          { name: "Bird dog row",                    detail: "10 reps each side" },
          { name: "Prone Y-T-W",                     detail: "2 × 10 each shape" },
        ];

      // ── UPPER BODY ────────────────────────────────────────────────────────
      case "upper":
        if (hasBarbell) return [
          { name: "Barbell bench press",             detail: S.heavy },
          { name: "Barbell bent-over row",           detail: S.heavy },
          { name: "Barbell overhead press",          detail: S.medium },
          { name: "Barbell bicep curl",              detail: S.medium },
          { name: "Face pull",                       detail: S.light },
        ];
        if (hasDumbbell || hasMachine) return [
          { name: hasDumbbell ? "Dumbbell row" : "Seated cable row", detail: S.medium },
          { name: hasDumbbell ? "Dumbbell press" : "Chest press machine", detail: S.medium },
          { name: hasDumbbell ? "Dumbbell shoulder press" : "Machine shoulder press", detail: S.medium },
          { name: hasDumbbell ? "Dumbbell curl" : "Cable curl", detail: S.medium },
          { name: hasDumbbell ? "Tricep extension" : "Cable pushdown", detail: S.medium },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Pull-up",                         detail: S.medium },
          { name: "Push-up",                         detail: S.circuit },
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Chin-up",                         detail: S.medium },
          { name: "Pike push-up",                    detail: S.circuit },
        ];
        return [
          { name: "Push-up",                         detail: S.circuit },
          { name: "Inverted row",                    detail: S.medium },
          { name: "Pike push-up",                    detail: S.circuit },
          { name: "Diamond push-up",                 detail: S.circuit },
          { name: "Superman hold",                   detail: S.hold },
        ];

      // ── LOWER BODY ────────────────────────────────────────────────────────
      case "lower":
        if (hasBarbell) return [
          { name: "Barbell squat",                   detail: S.heavy },
          { name: "Barbell deadlift",                detail: S.heavy },
          { name: "Barbell hip thrust",              detail: S.medium },
          { name: "Barbell lunge",                   detail: S.medium },
          { name: "Barbell calf raise",              detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Leg press",                       detail: S.medium },
          { name: "Leg curl",                        detail: S.medium },
          { name: "Hip thrust machine",              detail: S.medium },
          { name: "Leg extension",                   detail: S.light },
          { name: "Calf raise machine",              detail: S.light },
        ];
        if (hasDumbbell || hasKettle) return [
          { name: hasDumbbell ? "Goblet squat" : "KB goblet squat", detail: S.medium },
          { name: hasDumbbell ? "DB Romanian deadlift" : "KB swing", detail: S.medium },
          { name: "Bulgarian split squat",           detail: S.medium },
          { name: "Hip thrust",                      detail: S.medium },
          { name: "Calf raise",                      detail: S.light },
        ];
        return [
          { name: "Jump squat",                      detail: S.circuit },
          { name: "Reverse lunge",                   detail: "12 reps each side" },
          { name: "Glute bridge — pause",            detail: S.medium },
          { name: "Single-leg deadlift",             detail: S.isoCurl },
          { name: "Wall sit",                        detail: S.hold },
        ];

      // ── CARDIO / HIIT ─────────────────────────────────────────────────────
      case "cardio":
        if (isOutdoor || hasBars) return [
          { name: "Sprint 100m",                     detail: "6 × 100m — 60s rest" },
          { name: "Jump squat",                      detail: S.circuit },
          { name: "Burpee",                          detail: S.circuit },
          { name: "Mountain climbers",               detail: S.circuit },
          { name: "Box jump (park bench)",           detail: "4 × 10 reps" },
        ];
        if (hasKettle) return [
          { name: "Kettlebell swing",                detail: S.circuit },
          { name: "KB clean + press",                detail: S.circuit },
          { name: "KB goblet squat",                 detail: S.circuit },
          { name: "KB snatch",                       detail: S.circuit },
          { name: "KB thruster",                     detail: S.circuit },
        ];
        return [
          { name: "Jumping jacks",                   detail: S.circuit },
          { name: "High knees",                      detail: S.circuit },
          { name: "Mountain climbers",               detail: S.circuit },
          { name: "Burpee",                          detail: S.circuit },
          { name: "Jump squat",                      detail: S.circuit },
          { name: "Fast feet",                       detail: "30s" },
        ];

      // ── MOBILITY / RECOVERY ───────────────────────────────────────────────
      case "mobility":
        return [
          { name: "Cat-cow",                         detail: "2 min continuous" },
          { name: "90/90 hip stretch",               detail: "90s each side" },
          { name: "World's greatest stretch",        detail: "5 reps each side" },
          { name: "Thoracic rotation (seated)",      detail: "10 reps each side" },
          { name: "Couch stretch (hip flexor)",      detail: "90s each side" },
          { name: "Child's pose → downward dog flow", detail: "2 min" },
        ];

      // ── CALISTHENICS (explicit bodyweight progressive) ────────────────────
      case "calisthenics":
        return energy === "high" ? [
          { name: "Muscle-up progression (bar)",     detail: S.medium },
          { name: "Ring dip",                        detail: S.medium },
          { name: "Archer push-up",                  detail: S.medium },
          { name: "Pistol squat (or progression)",   detail: S.isoCurl },
          { name: "L-sit hold (floor or bar)",       detail: S.hold },
          { name: "Hollow body rock",                detail: S.circuit },
        ] : energy === "low" ? [
          { name: "Hanging scapular retraction",     detail: S.hold },
          { name: "Hollow body hold",                detail: S.hold },
          { name: "Slow push-up (3s down, 3s up)",   detail: S.light },
          { name: "Inverted row",                    detail: S.medium },
          { name: "Squat — slow and controlled",     detail: S.medium },
        ] : [
          { name: "Pull-up (full ROM)",              detail: S.medium },
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Archer push-up",                  detail: S.medium },
          { name: "Pistol squat progression",        detail: S.isoCurl },
          { name: "Front lever tuck hold",           detail: S.hold },
          { name: "L-sit hold",                      detail: S.hold },
        ];

      // ── OUTDOOR / PARK GYM ────────────────────────────────────────────────
      case "outdoor":
        return [
          { name: "Pull-up (or jumping pull-up)",    detail: S.medium },
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Box jump (park bench)",           detail: "4 × 8 reps" },
          { name: "Sprint 50m",                      detail: "5 × 50m — 45s rest" },
          { name: "Push-up",                         detail: S.circuit },
          { name: "Hanging knee raise",              detail: S.medium },
        ];

      // ── FULL BODY ─────────────────────────────────────────────────────────
      default:
        if (hasBarbell) return [
          { name: "Barbell deadlift",                detail: S.heavy },
          { name: "Barbell bent-over row",           detail: S.medium },
          { name: "Barbell overhead press",          detail: S.medium },
          { name: "Barbell front squat",             detail: S.medium },
          { name: "Push-up",                         detail: S.light },
        ];
        if (hasMachine) return [
          { name: "Leg press",                       detail: S.medium },
          { name: "Lat pulldown",                    detail: S.medium },
          { name: "Chest press machine",             detail: S.medium },
          { name: "Cable row",                       detail: S.medium },
          { name: "Shoulder press machine",          detail: S.medium },
        ];
        if (hasDumbbell) return [
          { name: "Dumbbell Romanian deadlift",      detail: S.medium },
          { name: "Dumbbell row",                    detail: S.medium },
          { name: "Dumbbell press",                  detail: S.medium },
          { name: "Goblet squat",                    detail: S.medium },
          { name: "Farmer carry (20m)",              detail: "3 × 20m" },
        ];
        if (hasKettle) return [
          { name: "Kettlebell swing",                detail: S.medium },
          { name: "Goblet squat",                    detail: S.medium },
          { name: "KB clean + press",                detail: S.medium },
          { name: "KB single-leg deadlift",          detail: S.isoCurl },
          { name: "KB renegade row",                 detail: S.medium },
        ];
        if (hasBars || isOutdoor) return [
          { name: "Pull-up",                         detail: S.medium },
          { name: "Push-up",                         detail: S.circuit },
          { name: "Parallel bar dip",                detail: S.medium },
          { name: "Box jump / step-up",              detail: S.medium },
          { name: "Hanging leg raise",               detail: S.medium },
        ];
        if (hasBand) return [
          { name: "Banded squat",                    detail: S.medium },
          { name: "Band row",                        detail: S.medium },
          { name: "Band overhead press",             detail: S.medium },
          { name: "Banded glute bridge",             detail: S.medium },
          { name: "Band pull-apart",                 detail: S.light },
        ];
        return [ // pure bodyweight
          { name: "Squat",                           detail: S.circuit },
          { name: "Push-up",                         detail: S.circuit },
          { name: "Reverse lunge",                   detail: "10 reps each side" },
          { name: "Plank shoulder taps",             detail: "30s" },
          { name: "Glute bridge",                    detail: "15 reps" },
        ];
    }
  }

  // ── Scale move count to session length ───────────────────────────────────
  const moveCount = Math.min(Math.max(Math.round(durationMin / (hasGym ? 10 : 4)), 3), 6);
  const moves = pickMoves(area).slice(0, moveCount);

  // ── Area-specific warmups ─────────────────────────────────────────────────
  const warmups: Record<string, string> = {
    back:        "5 min: cat-cow × 10, band pull-apart × 15, scapular shrugs × 10, light row warm-up set.",
    chest:       "5 min: arm circles, shoulder CARs × 5 each, push-up warm-up sets, pec minor stretch.",
    shoulders:   "5 min: arm circles, band pull-apart × 15, shoulder CARs × 5 each, light press warm-up set.",
    biceps:      "3 min: arm circles, wrist circles, supinated dead hang 20s, light curl warm-up set.",
    triceps:     "3 min: arm circles, cross-body stretch, overhead tricep stretch, light pushdown warm-up.",
    arms:        "3 min: arm circles, wrist rolls, cross-body shoulder stretch, light warm-up sets.",
    glutes:      "5 min: hip circles × 10, clamshell × 12 each, banded walk 2 × 10 steps, glute bridge × 10.",
    core:        "3 min: pelvic tilts × 10, dead bug practice × 5, cat-cow × 8, breath work.",
    legs:        "5 min: hip circles, leg swings × 10 each, bodyweight squat × 10, hip flexor stretch 30s each.",
    push:        "5 min: arm circles, band pull-apart × 15, push-up warm-up sets, shoulder CARs.",
    pull:        "5 min: cat-cow × 10, scapular shrugs, band pull-apart × 15, light row warm-up set.",
    upper:       "5 min: arm circles, shoulder CARs, push-up × 5, inverted row practice.",
    lower:       "5 min: hip circles, leg swings, bodyweight squat × 10, hip flexor stretch.",
    cardio:      "3 min: march in place, hip circles, leg swings, high knees easy pace.",
    mobility:    "2 min: deep breathing, neck rolls, shoulder rolls, easy twist.",
    calisthenics:"5 min: arm circles, scapular push-up × 10, hollow body practice, wrist circles, active hang 30s.",
    outdoor:     "5 min: jog 400m easy, arm circles, hip circles, bodyweight squat × 10.",
    "full body": "5 min: arm circles, hip circles, bodyweight squat × 8, push-up × 5.",
  };

  // ── Key coaching cues per area ────────────────────────────────────────────
  const coachNotes: Record<string, string> = {
    back:        "Retract your scapula before each pull — shoulder blades in first, then arms. Control the return.",
    chest:       "3 seconds down, pause at the bottom, press explosively. Don't bounce off your chest.",
    shoulders:   "Press strictly — no lower-back lean. If you arch, drop the weight 10%.",
    biceps:      "Full range: start arms extended, curl to full contraction. Squeeze hard at the top.",
    triceps:     "Lock out every rep. At the bottom: full stretch. At the top: full lock. No half-reps.",
    arms:        "Squeeze the bicep at the top of every curl; lock out the tricep at the end of every extension.",
    glutes:      "Squeeze your glutes hard at the top of every rep and hold 1 second. That contraction is the workout.",
    core:        "Every rep is controlled. If your lower back leaves the floor, you've gone too far — reset and try again.",
    legs:        "Core braced before every rep. Knees track over toes — don't let them cave on the way down.",
    push:        "Elbows at 45° to your torso on press movements — protects your shoulder and uses more chest.",
    pull:        "Lead with your elbows, not your hands. Hands are hooks; your back does the pulling.",
    upper:       "Alternate push and pull exercises if time allows — it cuts rest time and balances the session.",
    lower:       "Hip hinge: push your hips back first, not down. Think 'close the drawer with your butt'.",
    cardio:      "Pace yourself: if you can't finish a full interval with good form, shorten the work, not the rest.",
    mobility:    "Breathe into each stretch. Exhale to go deeper. No bouncing — hold each position.",
    calisthenics:"Quality over quantity. One perfect rep beats five sloppy ones. Tight core throughout.",
    outdoor:     "Use the full park: run between stations. The travel time is active rest, not wasted time.",
    "full body": "Compound lifts first, isolation last. Rest 90s between heavy sets; 60s for everything else.",
  };

  const rounds = durationMin <= 15 ? 2 : durationMin <= 30 ? 3 : durationMin <= 45 ? 4 : 5;
  const energyWord = energy === "low" ? "low-intensity" : energy === "high" ? "high-intensity" : "moderate";
  const areaTitle = ({
    "full body": "Full Body", back: "Back", chest: "Chest", shoulders: "Shoulders",
    biceps: "Biceps", triceps: "Triceps", arms: "Arms", glutes: "Glutes", core: "Core",
    legs: "Legs", push: "Push Day", pull: "Pull Day", upper: "Upper Body", lower: "Lower Body",
    cardio: "Cardio", mobility: "Mobility", calisthenics: "Calisthenics", outdoor: "Outdoor",
  } as Record<string, string>)[area] ?? "Full Body";

  return {
    title: `${durationMin}-Minute ${gearLabel} ${areaTitle} ${energy === "low" ? "Session" : "Workout"}`,
    focus:  `${areaTitle} · ${energyWord} · ${gearLabel.toLowerCase()}`,
    durationMin,
    warmup: warmups[area] ?? warmups["full body"],
    moves,
    coachNote: (coachNotes[area] ?? coachNotes["full body"]) + (rounds > 3 ? ` ${rounds} rounds total.` : ""),
  };
}
