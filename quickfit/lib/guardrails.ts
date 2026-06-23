// Guardrails matter the moment real strangers can hit your LLM from their phones.
// INPUT: stop abuse / injection / junk — and, for a fitness product, anything that
// looks like an injury or medical question (we are NOT a doctor).
// OUTPUT: validate the workout is well-formed; never surface PII or a leaked prompt.

export type GuardrailResult = { ok: boolean; flags: string[]; safeMessage?: string };

const PROMPT_INJECTION = [
  /ignore (all |your |previous )?(instructions|prompt)/i,
  /system prompt/i,
  /reveal your (instructions|rules|prompt)/i,
  /you are now/i,
  /disregard (the )?(above|rules)/i,
];
const ABUSE = [/\b(fuck you|kill you|idiot|moron|retard)\b/i];
// Injury / medical signals — route these to a professional instead of generating a workout.
const MEDICAL = [
  /\b(injur\w*|sprain\w*|strain\w*|torn|tear|fracture\w*|broken bone|herniat\w*|slipped disc)\b/i,
  /\b(chest pain|dizzy|faint|short of breath|palpitation)\b/i,
  /\b(pain|hurts?|aching badly|acl|mcl|surgery|rehab|physical therapy|physio)\b/i,
  /\b(pregnan\w*|diabet\w*|heart condition|high blood pressure)\b/i,
];
const CARD_NUMBER = /\b(?:\d[ -]*?){13,16}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
// Signs the model regurgitated its own instructions. NOTE: do not match the output
// field names themselves — those appear in every valid result.
const LEAKED_PROMPT = /(return only json|these instructions|you are "quickfit"|workout_shape)/i;

export function checkInput(request: string): GuardrailResult {
  const flags: string[] = [];
  const text = (request ?? "").trim();

  if (text.length < 4) return { ok: false, flags: ["too_short"], safeMessage: "Tell me what you've got — your time, energy, and any equipment — and I'll build a workout." };
  if (text.length > 1000) flags.push("too_long");
  if (PROMPT_INJECTION.some((r) => r.test(text))) flags.push("prompt_injection");
  if (ABUSE.some((r) => r.test(text))) flags.push("abuse");
  if (MEDICAL.some((r) => r.test(text))) flags.push("medical");

  if (flags.includes("prompt_injection") || flags.includes("abuse")) {
    return { ok: false, flags, safeMessage: "Let's keep it to workouts — tell me your time, energy, and equipment and I'll build one." };
  }
  if (flags.includes("medical")) {
    return { ok: false, flags, safeMessage: "I can't help with pain, injuries, or medical conditions — please check with a doctor or physio first. For a general session, just tell me your time, energy, and equipment." };
  }
  return { ok: true, flags };
}

// Validate the structured workout before it ever reaches a screen.
export function checkOutput(raw: string): GuardrailResult & { result?: any } {
  const flags: string[] = [];
  let result: any = null;
  try {
    result = JSON.parse(raw);
  } catch {
    flags.push("bad_json");
    return { ok: false, flags, safeMessage: "Hmm, that came back malformed. Try rephrasing what you've got." };
  }

  for (const f of ["title", "focus", "warmup", "coachNote"]) {
    if (!result[f] || typeof result[f] !== "string" || result[f].trim().length < 3) flags.push(`missing_${f}`);
  }
  if (typeof result.durationMin !== "number" || result.durationMin <= 0) flags.push("bad_duration");
  if (!Array.isArray(result.moves) || result.moves.length < 3 || result.moves.some((m: any) => !m?.name || !m?.detail)) flags.push("bad_moves");

  const blob = JSON.stringify(result);
  if (CARD_NUMBER.test(blob) || SSN.test(blob) || EMAIL.test(blob)) flags.push("pii_in_output");
  if (LEAKED_PROMPT.test(blob)) flags.push("leaked_prompt");

  if (flags.some((f) => f.startsWith("missing_")) || flags.includes("bad_duration") || flags.includes("bad_moves") || flags.includes("pii_in_output") || flags.includes("leaked_prompt")) {
    return { ok: false, flags, safeMessage: "Couldn't build a clean workout from that — tell me your time, energy, and equipment and I'll try again." };
  }
  return { ok: true, flags, result };
}
