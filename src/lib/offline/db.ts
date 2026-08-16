import { DBSchema, IDBPDatabase, openDB } from "idb";

export type DataTab = "trips" | "tripDays" | "despesas" | "receitas" | "anexos";

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

export interface AnexoFileRow {
  fileId: string;
  trip_id: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

interface TravelTrackDB extends DBSchema {
  trips: { key: string; value: RowBase };
  tripDays: { key: string; value: RowBase; indexes: { trip_id: string } };
  despesas: { key: string; value: RowBase; indexes: { trip_id: string } };
  receitas: { key: string; value: RowBase; indexes: { trip_id: string } };
  anexos: { key: string; value: RowBase; indexes: { trip_id: string } };
  anexoFiles: { key: string; value: AnexoFileRow; indexes: { trip_id: string } };
  outbox: { key: string; value: OutboxEntry };
  meta: { key: string; value: { key: string; value: unknown } };
}

const DB_NAME = "traveltrack-offline";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<TravelTrackDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TravelTrackDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB não disponível (chamado fora do navegador)");
  }
  if (!dbPromise) {
    dbPromise = openDB<TravelTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("trips")) {
          db.createObjectStore("trips", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tripDays")) {
          db.createObjectStore("tripDays", { keyPath: "id" }).createIndex("trip_id", "trip_id");
        }
        if (!db.objectStoreNames.contains("despesas")) {
          db.createObjectStore("despesas", { keyPath: "id" }).createIndex("trip_id", "trip_id");
        }
        if (!db.objectStoreNames.contains("receitas")) {
          db.createObjectStore("receitas", { keyPath: "id" }).createIndex("trip_id", "trip_id");
        }
        if (!db.objectStoreNames.contains("anexos")) {
          db.createObjectStore("anexos", { keyPath: "fileId" }).createIndex("trip_id", "trip_id");
        }
        if (!db.objectStoreNames.contains("anexoFiles")) {
          db.createObjectStore("anexoFiles", { keyPath: "fileId" }).createIndex(
            "trip_id",
            "trip_id"
          );
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "localId" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
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

export async function putAnexoFile(row: AnexoFileRow): Promise<void> {
  const db = await getDB();
  await db.put("anexoFiles", row);
}

export async function listByTrip(
  tab: "tripDays" | "despesas" | "receitas" | "anexos",
  tripId: string
) {
  const db = await getDB();
  return db.getAllFromIndex(tab, "trip_id", tripId);
}

export async function listAnexoFilesByTrip(tripId: string): Promise<AnexoFileRow[]> {
  const db = await getDB();
  return db.getAllFromIndex("anexoFiles", "trip_id", tripId);
}

export async function getAnexoFile(fileId: string): Promise<AnexoFileRow | undefined> {
  const db = await getDB();
  return db.get("anexoFiles", fileId);
}

export async function listAll(tab: DataTab) {
  const db = await getDB();
  return db.getAll(tab);
}

export async function getOne(tab: DataTab, id: string) {
  const db = await getDB();
  return db.get(tab, id);
}

export async function deleteByTrip(
  tab: "tripDays" | "despesas" | "receitas" | "anexos" | "anexoFiles",
  tripId: string
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(tab, "readwrite");
  const index = tx.store.index("trip_id");
  let cursor = await index.openCursor(IDBKeyRange.only(tripId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteMany(
  tab: "anexos" | "anexoFiles",
  keys: string[]
): Promise<void> {
  if (!keys.length) return;
  const db = await getDB();
  const tx = db.transaction(tab, "readwrite");
  await Promise.all(keys.map((k) => tx.store.delete(k)));
  await tx.done;
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
