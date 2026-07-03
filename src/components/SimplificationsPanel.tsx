/*
 * "What we simplified" panel (SPEC §6/§7.6) — a mandatory credibility
 * feature: every simplification vs. the real protocol, with paper links.
 */

export interface Simplification {
  text: string;
  link?: { label: string; href: string };
}

export function SimplificationsPanel(props: { items: Simplification[] }) {
  return (
    <details className="group border-t border-muted bg-panel px-4 py-2">
      <summary className="cursor-pointer list-none font-mono text-[10px] tracking-[0.2em] text-ink/45 uppercase transition-colors hover:text-teal">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
        What we simplified
      </summary>
      <ul className="mt-2 mb-1 space-y-1.5 pl-1">
        {props.items.map((s, i) => (
          <li key={i} className="text-xs leading-relaxed text-ink/65">
            <span className="mr-2 text-ink/30">·</span>
            {s.text}
            {s.link && (
              <>
                {" "}
                <a
                  href={s.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
                >
                  {s.link.label}
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
