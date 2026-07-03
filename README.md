# Consensus Playground

An interactive, browser-based laboratory that teaches how blockchain consensus
algorithms work by letting you *operate* them: inject latency, partition
networks, run adversaries, and watch ordering, forks, votes, and finality
happen visually in real time. Static frontend, no backend — every "node" is
simulated deterministically in your browser.

Full build spec: [SPEC.md](./SPEC.md).

## Status

- ✅ **Phase 0 — Skeleton:** Vite + React 18 + TypeScript (strict) + Tailwind,
  engine-purity ESLint rules, Vitest, CI + GitHub Pages deploy, non-functional
  exhibit shell (chaos controls + transport bar).
- ⏳ Phase 1 — Engine core (seeded RNG, tick loop, network, event log).
- ⏳ Phase 2 — Exhibit 1: Time & ordering (public MVP).

## Development

```sh
npm install
npm run dev       # local dev server
npm run lint      # includes engine-purity rules (SPEC §4/§10.4)
npm test          # Vitest
npm run build     # type-check + static build to dist/
```

## Architecture in one line

One deterministic, framework-free simulation engine (`src/engine/**` — no
React, no DOM, no wall-clock, no `Math.random`); every exhibit is a config of
that engine plus a visual skin (SPEC §4).

## Out-of-scope backlog (SPEC §13 — do not build yet)

- Multiple-concurrent-proposers exhibit
- Network split-brain exhibit
- PoS stake-weighting overlays
- Classroom mode (instructor drives, students watch)
- Embeddable single-exhibit iframes for blog posts
- Localized copy (BHS translation)
