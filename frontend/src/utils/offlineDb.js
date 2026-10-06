// Tiny promise wrapper around IndexedDB (Phase C: offline outbox).
// No dependency — just enough for three stores in the `wtg-offline` DB:
//   outbox    seq (auto-increment) — queued mutations, oldest first
//   readCache key                  — last-good GET bodies, served offline
//   meta      key                  — lastKnownUser, tmpIdMap, lastSyncAt
// Every function resolves null/[]/false when IndexedDB is unavailable
// (private mode, unsupported browser) so callers degrade, never crash.

const DB_NAME = "wtg-offline";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") {
        reject(new Error("indexeddb-unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("outbox")) {
          const s = db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
          s.createIndex("by-status", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains("readCache")) {
          db.createObjectStore("readCache", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb-open-failed"));
    } catch (err) {
      reject(err);
    }
  });
  // A failed open must not poison later calls (e.g. transient private-mode).
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run(storeName, mode, op) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        let req;
        try {
          const tx = db.transaction(storeName, mode);
          tx.onerror = () => reject(tx.error || new Error("idb-tx-failed"));
          req = op(tx.objectStore(storeName));
        } catch (err) {
          reject(err);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("idb-request-failed"));
      }),
    () => undefined
  );
}

export async function idbPut(storeName, value) {
  const key = await run(storeName, "readwrite", (store) => store.put(value));
  return key;
}

export async function idbGet(storeName, key) {
  const value = await run(storeName, "readonly", (store) => store.get(key));
  return value === undefined ? null : value;
}

export async function idbDel(storeName, key) {
  await run(storeName, "readwrite", (store) => store.delete(key));
}

export async function idbGetAll(storeName) {
  const rows = await run(storeName, "readonly", (store) => store.getAll());
  return Array.isArray(rows) ? rows : [];
}

export async function idbClear(storeName) {
  await run(storeName, "readwrite", (store) => store.clear());
}
