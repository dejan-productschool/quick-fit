// The research-synthesis prompt. Feed it raw interview transcripts; get back
// clustered themes, the top pain, and a candidate hypothesis to validate.

export function buildResearchPrompt(): string {
  return `You are a senior product researcher doing research synthesis.
You will receive a set of user interview transcripts. Cluster them.

Return ONLY JSON with this shape:
{
  "themes": [{ "name": string, "weight": number, "quoteIds": string[] }],   // weight = how many transcripts touch the theme, most common first
  "topPain": string,                  // the single sharpest, most frequent pain, in one sentence
  "candidateHypothesis": string,      // a testable hypothesis that addresses the top pain
  "riskiestAssumption": string        // the one assumption most likely to be wrong
}

Be specific and evidence-driven. Quote ids must come from the transcripts. No preamble.`;
}

export function formatTranscripts(transcripts: { id: string; persona: string; quote: string }[]): string {
  return transcripts.map((t) => `[${t.id}] (${t.persona}): "${t.quote}"`).join("\n\n");
}
