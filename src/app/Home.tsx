import { Link } from "react-router-dom";

const chapters = [
  {
    to: "/ex1-time",
    title: "Time & ordering",
    hook: "There is no such thing as “at the same time”.",
    live: true,
  },
  { title: "Fork wars", hook: "Longest chain wins. Usually.", live: false },
  { title: "BFT voting rounds", hook: "Why one-third is a magic number.", live: false },
  { title: "DAG snapshots", hook: "What if everyone proposes at once?", live: false },
  { title: "Solana wing", hook: "Manufacturing time itself.", live: false },
];

export function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-[0.3em] text-teal uppercase">
          Consensus Playground
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          An oscilloscope for consensus.
        </h1>
        <p className="max-w-xl text-ink/70">
          Operate the algorithms that order the world&rsquo;s blockchains: inject
          latency, split networks, run adversaries — and watch forks, votes, and
          finality happen in front of you.
        </p>
      </header>

      <ol className="space-y-2">
        {chapters.map((c) =>
          c.live && c.to ? (
            <li key={c.title}>
              <Link
                to={c.to}
                className="group flex items-baseline justify-between gap-4 rounded-md border border-muted bg-panel px-4 py-3 transition-colors hover:border-teal"
              >
                <span className="font-medium group-hover:text-teal">{c.title}</span>
                <span className="text-right text-sm text-ink/50">{c.hook}</span>
              </Link>
            </li>
          ) : (
            <li
              key={c.title}
              className="flex items-baseline justify-between gap-4 rounded-md border border-muted/50 px-4 py-3 text-ink/35"
            >
              <span>
                {c.title}
                <span className="ml-2 font-mono text-[10px] tracking-widest uppercase">
                  soon
                </span>
              </span>
              <span className="text-right text-sm">{c.hook}</span>
            </li>
          ),
        )}
      </ol>

      <footer className="font-mono text-xs text-ink/40">
        Phase 0 skeleton — the simulation engine arrives in Phase 1.
      </footer>
    </main>
  );
}
