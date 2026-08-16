import { DBSchema, IDBPDatabase, openDB } from "idb";

export type DataTab = "trips" | "tripDays" | "despesas" | "receitas";

export interface OutboxEntry {
  localId: string;
  kind: "createTrip" | "createDespesa" | "createReceita" | "saveDays";
  tripId?: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

interface RowBase {
  id: string;
  trip_id?: string;
  [key: string]: unknown;
}

interface TravelTrackDB extends DBSchema {
  trips: { key: string; value: RowBase };
  tripDays: { key: string; value: RowBase; indexes: { trip_id: string } };
  despesas: { key: string; value: RowBase; indexes: { trip_id: string } };
  receitas: { key: string; value: RowBase; indexes: { trip_id: string } };
  outbox: { key: string; value: OutboxEntry };
  meta: { key: string; value: { key: string; value: unknown } };
}

const DB_NAME = "traveltrack-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TravelTrackDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TravelTrackDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB não disponível (chamado fora do navegador)");
  }
  if (!dbPromise) {
    dbPromise = openDB<TravelTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("trips", { keyPath: "id" });
        const days = db.createObjectStore("tripDays", { keyPath: "id" });
        days.createIndex("trip_id", "trip_id");
        const despesas = db.createObjectStore("despesas", { keyPath: "id" });
        despesas.createIndex("trip_id", "trip_id");
        const receitas = db.createObjectStore("receitas", { keyPath: "id" });
        receitas.createIndex("trip_id", "trip_id");
        db.createObjectStore("outbox", { keyPath: "localId" });
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export async function putAll(tab: DataTab, rows: RowBase[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(tab, "readwrite");
  await Promise.all(rows.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function putOne(tab: DataTab, row: RowBase): Promise<void> {
  const db = await getDB();
  await db.put(tab, row);
}

export async function listByTrip(tab: "tripDays" | "despesas" | "receitas", tripId: string) {
  const db = await getDB();
  return db.getAllFromIndex(tab, "trip_id", tripId);
}

export async function listAll(tab: DataTab) {
  const db = await getDB();
  return db.getAll(tab);
}

export async function getOne(tab: DataTab, id: string) {
  const db = await getDB();
  return db.get(tab, id);
}

export async function enqueueOutbox(entry: Omit<OutboxEntry, "createdAt" | "attempts">) {
  const db = await getDB();
  await db.put("outbox", { ...entry, createdAt: Date.now(), attempts: 0 });
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDB();
  const all = await db.getAll("outbox");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOutboxEntry(localId: string) {
  const db = await getDB();
  await db.delete("outbox", localId);
}

export async function updateOutboxEntry(entry: OutboxEntry) {
  const db = await getDB();
  await db.put("outbox", entry);
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await getDB();
  const row = await db.get("meta", key);
  return row?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}
