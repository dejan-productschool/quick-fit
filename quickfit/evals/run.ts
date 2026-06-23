// Eval harness — runs the SAME pipeline the /api/forge route uses
// (input guardrail → model → output guardrail) against a golden set.
//
//   npm run eval
//
// Define "working" BEFORE you let strangers hit it. This file is that definition, in code.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { complete } from "../lib/llm";
import { buildWorkoutPrompt } from "../lib/workout";
import { checkInput, checkOutput } from "../lib/guardrails";

type Checks = {
  expectResult?: boolean;
  fieldsNonEmpty?: string[];
  mustIncludeAny?: string[];
  mustNotMatchOutput?: string[];
  expectBlock?: "input" | "output";
  expectFlags?: string[];
};
type Case = { id: string; input: string; checks: Checks };

async function runPipeline(idea: string) {
  const input = checkInput(idea);
  if (!input.ok) return { blockedAt: "input" as const, flags: input.flags, result: null as any };
  const raw = await complete(
    [
      { role: "system", content: buildWorkoutPrompt() },
      { role: "user", content: idea },
    ],
    { json: true }
  );
  const output = checkOutput(raw);
  if (!output.ok) return { blockedAt: "output" as const, flags: [...input.flags, ...output.flags], result: null as any };
  return { blockedAt: null as null, flags: [...input.flags, ...output.flags], result: output.result };
}

function evaluate(c: Case, r: { blockedAt: string | null; flags: string[]; result: any }): string[] {
  const fails: string[] = [];
  const ch = c.checks;
  if (ch.expectBlock && r.blockedAt !== ch.expectBlock) fails.push(`expected block ${ch.expectBlock}, got ${r.blockedAt ?? "none"}`);
  for (const f of ch.expectFlags ?? []) if (!r.flags.includes(f)) fails.push(`missing flag "${f}"`);
  if (ch.expectResult && !r.result) fails.push(`expected a forged result, got blocked (${r.flags.join(", ")})`);
  for (const f of ch.fieldsNonEmpty ?? []) {
    if (!r.result?.[f] || String(r.result[f]).trim().length < 8) fails.push(`field "${f}" empty/short`);
  }
  const blob = r.result ? JSON.stringify(r.result).toLowerCase() : "";
  if (ch.mustIncludeAny && r.result && !ch.mustIncludeAny.some((s) => blob.includes(s.toLowerCase()))) fails.push(`output missing any of [${ch.mustIncludeAny.join(", ")}]`);
  for (const p of ch.mustNotMatchOutput ?? []) if (blob && new RegExp(p, "i").test(blob)) fails.push(`output matched forbidden /${p}/`);
  return fails;
}

async function main() {
  const file = join(import.meta.dirname ?? __dirname, "golden.jsonl");
  const cases: Case[] = readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  let pass = 0;
  console.log(`\nRunning ${cases.length} golden cases…\n`);
  for (const c of cases) {
    const r = await runPipeline(c.input);
    const fails = evaluate(c, r);
    if (fails.length === 0) {
      pass++;
      console.log(`  PASS  ${c.id}`);
    } else {
      console.log(`  FAIL  ${c.id}`);
      fails.forEach((f) => console.log(`        └─ ${f}`));
    }
  }
  const score = Math.round((pass / cases.length) * 100);
  console.log(`\nScore: ${pass}/${cases.length}  (${score}%)\n`);
  process.exit(pass === cases.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
