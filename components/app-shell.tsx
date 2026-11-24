"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FlaskConical, House, List, Menu, PanelLeftClose, PanelLeftOpen, Settings, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Home", short: "Home", icon: House, key: "home" },
  { href: "/#matches", label: "Matches", short: "Matches", icon: List, key: "matches" },
  { href: "/nfl", label: "NFL Prop Lab", short: "NFL", icon: BarChart3 },\n  { href: "/builder", label: "Parlays & Builder", short: "Parlays", icon: SlidersHorizontal },
  { href: "/backtest", label: "Backtesting Lab", short: "Lab", icon: FlaskConical },
  { href: "/paper", label: "Paper Performance", short: "Paper", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hash, setHash] = useState("");
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [pathname]);
  const active = (href: string, key?: string) => key === "home" ? pathname === "/" && hash !== "#matches" : key === "matches" ? pathname.startsWith("/matches") || pathname === "/" && hash === "#matches" : pathname.startsWith(href);

  return (
    <div className={`app-shell ${collapsed ? "shell-collapsed" : ""}`}>
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">M</div>
          <div><strong>MIGO</strong><span>Soccer Intelligence</span></div>
          <button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="side-nav" aria-label="Primary navigation">
          {nav.map(({ href, label, icon: Icon, key }) => (
            <Link key={href} href={href} className={active(href, key) ? "active" : ""} title={label}>
              <Icon size={18} /><span>{label}</span>{active(href, key) && <i />}
            </Link>
          ))}
        </nav>
        <div className="side-nav side-nav-utility"><Link href="/settings" className={pathname.startsWith("/settings") ? "active" : ""}><Settings size={18}/><span>Settings</span></Link></div>
        <div className="sidebar-status">
          <div className="status-line"><span className="status-dot live" />Local workspace</div>
          <p>Paper results stay in this browser.</p>
        </div>
        <button className="collapse-sidebar" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}<span>{collapsed ? "" : "Collapse"}</span></button>
      </aside>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <div className="main-frame">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="mobile-wordmark">MIGO</div>
          <div className="topbar-right">
            <span className="paper-pill"><span /> PAPER MODE</span>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map(({ href, short, icon: Icon, key }) => (
          <Link key={href} href={href} className={active(href, key) ? "active" : ""}><Icon size={20} /><span>{short}</span></Link>
        ))}
      </nav>
    </div>
  );
}
