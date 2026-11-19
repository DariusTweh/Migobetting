"use client";

import { normalizeTeamName, type HistoricalMatch } from "./history";

const DB_NAME = "migo-history-v1";
const STORE = "matches";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("competition", "competition");
        store.createIndex("season", "season");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function importHistoricalMatches(matches: HistoricalMatch[]) {
  const database = await openDatabase();
  return new Promise<{ inserted: number; updated: number }>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    let inserted = 0;
    let updated = 0;
    matches.forEach((match) => {
      const lookup = store.get(match.id);
      lookup.onsuccess = () => {
        if (lookup.result) updated += 1; else inserted += 1;
        const existing = lookup.result as HistoricalMatch | undefined;
        store.put({ ...existing, ...match, lineup: match.lineup ?? existing?.lineup });
      };
    });
    transaction.oncomplete = () => { database.close(); resolve({ inserted, updated }); };
    transaction.onerror = () => reject(transaction.error);
  });
}

const fixtureKey = (match: HistoricalMatch) => [match.competition, match.date.slice(0, 10), normalizeTeamName(match.homeTeam), normalizeTeamName(match.awayTeam)].join(":");

export async function replaceSynchronizedHistory(matches: HistoricalMatch[]) {
  const database = await openDatabase();
  return new Promise<{ inserted: number; updated: number }>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    let inserted = 0;
    let updated = 0;
    request.onsuccess = () => {
      const existing = request.result as HistoricalMatch[];
      const providerRows = existing.filter((match) => match.source.includes("football-data.co.uk"));
      const customRows = existing.filter((match) => !match.source.includes("football-data.co.uk"));
      const previousByFixture = new Map(providerRows.map((match) => [fixtureKey(match), match]));
      store.clear();
      customRows.forEach((match) => store.put(match));
      matches.forEach((match) => {
        const previous = previousByFixture.get(fixtureKey(match));
        if (previous) updated += 1; else inserted += 1;
        store.put({ ...match, lineup: match.lineup ?? previous?.lineup });
      });
    };
    transaction.oncomplete = () => { database.close(); resolve({ inserted, updated }); };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getHistoricalMatches(): Promise<HistoricalMatch[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => { database.close(); resolve(request.result as HistoricalMatch[]); };
    request.onerror = () => reject(request.error);
  });
}

export async function clearHistoricalMatches() {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).clear();
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}
