"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Dices, FlaskConical, LayoutDashboard, Menu, Settings, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Command Center", short: "Home", icon: LayoutDashboard },
  { href: "/simulation", label: "Match Simulator", short: "Match Sim", icon: Dices },
  { href: "/builder", label: "Parlays & Builder", short: "Parlays", icon: SlidersHorizontal },
  { href: "/backtest", label: "Backtesting Lab", short: "Lab", icon: FlaskConical },
  { href: "/paper", label: "Paper Performance", short: "Paper", icon: BarChart3 },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const active = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/matches") : pathname.startsWith(href));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">M</div>
          <div><strong>MIGO</strong><span>Soccer Intelligence</span></div>
          <button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="workspace-label">Research workspace</div>
        <nav className="side-nav" aria-label="Primary navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={active(href) ? "active" : ""}>
              <Icon size={18} /><span>{label}</span>{active(href) && <i />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="status-line"><span className="status-dot live" />Local workspace</div>
          <p>No account. No cloud database. Your paper ledger stays in this browser.</p>
        </div>
        <div className="responsible-note"><ShieldCheck size={17} /><span>Research only<br />Never a guarantee</span></div>
      </aside>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <div className="main-frame">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="mobile-wordmark">MIGO <span>/ INTELLIGENCE</span></div>
          <div className="topbar-right">
            <span className="paper-pill"><span /> PAPER MODE</span>
            <span className="model-pill">MIGO v0.1</span>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.slice(0, 5).map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} className={active(href) ? "active" : ""}><Icon size={20} /><span>{short}</span></Link>
        ))}
      </nav>
    </div>
  );
}
