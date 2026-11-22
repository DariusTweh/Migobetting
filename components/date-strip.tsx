"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef } from "react";
import { formatDayLabel, localDateKey, offsetDateKey, todayKey } from "@/lib/date-time";
import type { Fixture } from "@/lib/types";

export type MatchView = "date" | "all" | "live";

export function DateStrip({ fixtures, selectedDate, mode, onDate, onMode }: {
  fixtures: Fixture[]; selectedDate: string; mode: MatchView;
  onDate: (key: string) => void; onMode: (mode: MatchView) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const today = todayKey();
  const counts = useMemo(() => fixtures.reduce((map, fixture) => {
    const key = localDateKey(fixture.kickoff);
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>()), [fixtures]);
  const dates = useMemo(() => Array.from({ length: 9 }, (_, index) => offsetDateKey(today, index - 2)), [today]);
  const select = (key: string) => { onDate(key); onMode("date"); };
  return <section className="date-navigation" aria-label="Match date navigation">
    <div className="quick-filters" role="group" aria-label="Quick match filters">
      <button className={mode === "all" ? "active" : ""} onClick={() => onMode("all")}>All</button>
      <button className={mode === "live" ? "active live-filter" : "live-filter"} onClick={() => onMode("live")}>Live</button>
      <button className={mode === "date" && selectedDate === today ? "active" : ""} onClick={() => select(today)}>Today</button>
      <button className={mode === "date" && selectedDate === offsetDateKey(today, 1) ? "active" : ""} onClick={() => select(offsetDateKey(today, 1))}>Tomorrow</button>
    </div>
    <div className="date-rail-wrap">
      <button className="date-arrow" aria-label="Earlier dates" onClick={() => rail.current?.scrollBy({ left: -260, behavior: "smooth" })}><ChevronLeft size={18}/></button>
      <div className="date-rail" ref={rail}>
        {dates.map((key) => {
          const label = formatDayLabel(key, "short").split(", ");
          const active = mode === "date" && key === selectedDate;
          return <button key={key} className={active ? "active" : ""} aria-pressed={active} onClick={() => select(key)}>
            <span>{label[0]}</span><strong>{label[1]}</strong><small>{counts.get(key) ?? 0} matches</small>
          </button>;
        })}
      </div>
      <button className="date-arrow" aria-label="Later dates" onClick={() => rail.current?.scrollBy({ left: 260, behavior: "smooth" })}><ChevronRight size={18}/></button>
    </div>
  </section>;
}
