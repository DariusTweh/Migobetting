import { Info } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

export function PanelHead({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return <div className="panel-head"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>;
}

export function Metric({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "green" | "orange" }) {
  return <div className={`metric metric-${tone}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice"><Info size={17} /><div>{children}</div></div>;
}
