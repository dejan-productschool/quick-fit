# QuickFit — ProductCon 2026 live demo

A complete, rehearsable **"vibe coding on steroids"** demo: take a product from raw
research all the way to a deployed app that the audience uses live — research →
hypothesis → prototype → guardrails → ship → real users, in 30 minutes.

> **The Confidence Line, on steroids.** Speed is now free, so judgment is the job.

## What's in here

| Path | What it is |
|------|------------|
| [`index.html`](index.html) | Start-here hub linking to everything below |
| [`demo-brief.html`](demo-brief.html) | Short shareable one-pager (what the demo is, the flow, the QR) |
| [`confidence-line-slides.html`](confidence-line-slides.html) | The ~4-minute opening deck (the framing) |
| [`run-sheet.html`](run-sheet.html) | The full minute-by-minute run sheet — say/do/ask, prompts, setup, fallback |
| [`quickfit/`](quickfit/) | The Next.js app built live on stage |

## QuickFit, the app

Type what you've got right now — time, energy, equipment — and get one short workout
you can start immediately. Includes input/output guardrails, a medical safety
cut-out, an automated eval suite, and a shared **live wall** of workouts built in the room.

```bash
cd quickfit
npm install
cp .env.example .env.local   # runs offline in MOCK MODE (no API key needed)
npm run dev                  # http://localhost:3000
```

Useful scripts:

```bash
npm run research   # synthesise the interview transcripts into themes + top pain
npm run eval       # run the safety/quality eval suite
```

**Live:** https://quick-fit-neon.vercel.app

## Notes

- Everything runs offline in mock mode (`MOCK_LLM=1`) — no keys or network needed to rehearse.
- The live wall uses Vercel KV when configured, and falls back to an in-memory wall otherwise.
