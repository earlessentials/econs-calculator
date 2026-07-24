import Link from "next/link";
import type { ReactNode } from "react";

type LegalShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
};

const legalLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclaimer", label: "Disclaimer" },
];

export default function LegalShell({
  eyebrow,
  title,
  intro,
  children,
}: LegalShellProps) {
  return (
    <main className="legal-page">
      <header className="legal-topbar">
        <Link className="brand" href="/" aria-label="Econome by Pearling home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>Econome <small>by Pearling</small></span>
        </Link>
        <Link className="legal-back" href="/#library">
          Back to calculators <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <article className="legal-card">
        <header className="legal-hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <span className="legal-date">Effective 24 July 2026</span>
        </header>
        <div className="legal-content">{children}</div>
      </article>

      <footer className="legal-footer">
        <p>© All Rights Reserved 2026 · Designed by Pearling.</p>
        <nav className="footer-links" aria-label="Legal information">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <Link href="/">Econome home ↑</Link>
      </footer>
    </main>
  );
}
