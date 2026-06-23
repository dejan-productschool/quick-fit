// Market research synthesis — runnable live on stage.
//
//   npm run research
//
// Feeds the interview transcripts to the model, clusters them into themes,
// and surfaces the top pain + a candidate hypothesis. This is Beat 1 of the demo:
// raw transcripts in, a defensible hypothesis out.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { complete } from "../lib/llm";
import { buildResearchPrompt, formatTranscripts } from "../lib/research";

async function main() {
  const dir = import.meta.dirname ?? __dirname;
  const transcripts = JSON.parse(readFileSync(join(dir, "transcripts.json"), "utf8"));

  console.log(`\n📋 Synthesizing ${transcripts.length} interview transcripts…\n`);

  const raw = await complete(
    [
      { role: "system", content: buildResearchPrompt() },
      { role: "user", content: `Interview transcripts:\n\n${formatTranscripts(transcripts)}` },
    ],
    { json: true }
  );

  const out = JSON.parse(raw);

  console.log("── THEMES ───────────────────────────────────────────");
  for (const t of out.themes) {
    console.log(`  • ${t.name}  (${t.weight} transcripts: ${t.quoteIds.join(", ")})`);
  }
  console.log("\n── TOP PAIN ─────────────────────────────────────────");
  console.log(`  ${out.topPain}`);
  console.log("\n── CANDIDATE HYPOTHESIS ─────────────────────────────");
  console.log(`  ${out.candidateHypothesis}`);
  console.log("\n── RISKIEST ASSUMPTION ──────────────────────────────");
  console.log(`  ${out.riskiestAssumption}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
