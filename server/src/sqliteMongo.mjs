/**
 * Capa Mongo-compatible sobre SQLite vía sql.js (WASM; sin binarios nativos).
 * Ideal en Windows/local cuando better-sqlite3 no carga.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let readyPromise = null;
/** @type {import('sql.js').Database | null} */
let sqlDb = null;
let dbFile = "";

export function dbFilePath() {
  const custom = process.env.SQLITE_PATH ? String(process.env.SQLITE_PATH).trim() : "";
  if (custom) return path.resolve(custom);
  return path.join(__dirname, "..", "data", "local.sqlite");
}

function persist() {
  if (!sqlDb || !dbFile) return;
  schedulePersist();
}

let persistTimer = null;
let persistDirty = false;

function schedulePersist() {
  persistDirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersist();
  }, 250);
}

function flushPersist() {
  if (!persistDirty || !sqlDb || !dbFile) return;
  persistDirty = false;
  try {
    const data = sqlDb.export();
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    fs.writeFileSync(dbFile, Buffer.from(data));
  } catch (e) {
    console.warn("[sqlite] persist failed", e instanceof Error ? e.message : e);
  }
}

/** Fuerza escritura inmediata (shutdown / tests). */
export function flushSqlitePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  flushPersist();
}

async function openSqlite() {
  if (sqlDb) return sqlDb;
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const wasmPath = path.join(path.dirname(require.resolve("sql.js")), "sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    dbFile = dbFilePath();
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    if (fs.existsSync(dbFile)) {
      const buf = fs.readFileSync(dbFile);
      sqlDb = new SQL.Database(buf);
    } else {
      sqlDb = new SQL.Database();
    }
    sqlDb.run(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        doc TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
    `);
    sqlDb.run(`CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection);`);
    persist();
    console.log(`[sqlite] usando ${dbFile} (sql.js)`);
    if (!(globalThis).__plasmaSqliteFlushHook) {
      (globalThis).__plasmaSqliteFlushHook = true;
      const flush = () => {
        try {
          flushSqlitePersist();
        } catch {
          /* ignore */
        }
      };
      process.once("beforeExit", flush);
      process.once("SIGINT", flush);
      process.once("SIGTERM", flush);
    }
    return sqlDb;
  })();
  try {
    return await readyPromise;
  } catch (e) {
    readyPromise = null;
    sqlDb = null;
    throw e;
  }
}

function idKey(id) {
  if (id == null) return "";
  return String(id);
}

function revive(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(revive);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      out[k] = Number.isNaN(d.getTime()) ? v : d;
    } else {
      out[k] = revive(v);
    }
  }
  return out;
}

function parseDoc(raw) {
  try {
    return revive(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getPath(obj, dotted) {
  if (!dotted.includes(".")) return obj?.[dotted];
  let cur = obj;
  for (const p of dotted.split(".")) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function cmp(a, b) {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function matchOp(docVal, opObj) {
  for (const [op, expected] of Object.entries(opObj)) {
    if (op === "$ne") {
      if (docVal === expected) return false;
    } else if (op === "$eq") {
      if (docVal !== expected) return false;
    } else if (op === "$gt") {
      if (!(cmp(docVal, expected) > 0)) return false;
    } else if (op === "$gte") {
      if (!(cmp(docVal, expected) >= 0)) return false;
    } else if (op === "$lt") {
      if (!(cmp(docVal, expected) < 0)) return false;
    } else if (op === "$lte") {
      if (!(cmp(docVal, expected) <= 0)) return false;
    } else if (op === "$in") {
      if (!Array.isArray(expected) || !expected.some((x) => x === docVal || idKey(x) === idKey(docVal))) return false;
    } else if (op === "$nin") {
      if (Array.isArray(expected) && expected.some((x) => x === docVal)) return false;
    } else if (op === "$exists") {
      const exists = docVal !== undefined;
      if (Boolean(expected) !== exists) return false;
    } else {
      throw new Error(`Operador no soportado en SQLite local: ${op}`);
    }
  }
  return true;
}

function matches(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$and") {
      if (!Array.isArray(cond) || !cond.every((f) => matches(doc, f))) return false;
      continue;
    }
    if (key === "$or") {
      if (!Array.isArray(cond) || !cond.some((f) => matches(doc, f))) return false;
      continue;
    }
    const val = getPath(doc, key);
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      const keys = Object.keys(cond);
      if (keys.length && keys.every((k) => k.startsWith("$"))) {
        if (!matchOp(val, cond)) return false;
        continue;
      }
    }
    if (Array.isArray(val)) {
      if (!val.some((x) => x === cond || idKey(x) === idKey(cond))) return false;
      continue;
    }
    if (val !== cond && idKey(val) !== idKey(cond)) return false;
  }
  return true;
}

function applyUpdate(doc, update) {
  const out = { ...doc };
  if (!update || typeof update !== "object") return out;
  if (update.$set && typeof update.$set === "object") {
    for (const [k, v] of Object.entries(update.$set)) {
      if (k.includes(".")) {
        const parts = k.split(".");
        let cur = out;
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i];
          if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
          cur = cur[p];
        }
        cur[parts[parts.length - 1]] = v;
      } else {
        out[k] = v;
      }
    }
  }
  if (update.$inc && typeof update.$inc === "object") {
    for (const [k, v] of Object.entries(update.$inc)) {
      out[k] = Number(out[k] ?? 0) + Number(v);
    }
  }
  if (update.$unset && typeof update.$unset === "object") {
    for (const k of Object.keys(update.$unset)) delete out[k];
  }
  if (!Object.keys(update).some((k) => k.startsWith("$"))) Object.assign(out, update);
  return out;
}

function projectDoc(doc, projection) {
  if (!projection || Object.keys(projection).length === 0) return { ...doc };
  const includeId = projection._id !== 0;
  const keys = Object.keys(projection).filter((k) => k !== "_id");
  const including = keys.some((k) => projection[k] === 1 || projection[k] === true);
  if (including) {
    const out = {};
    if (includeId) out._id = doc._id;
    for (const k of keys) if (projection[k]) out[k] = doc[k];
    return out;
  }
  const out = { ...doc };
  if (!includeId) delete out._id;
  for (const k of keys) if (projection[k] === 0 || projection[k] === false) delete out[k];
  return out;
}

function sortDocs(docs, sortSpec) {
  if (!sortSpec) return docs;
  const entries = Object.entries(sortSpec);
  return [...docs].sort((a, b) => {
    for (const [k, dir] of entries) {
      const c = cmp(getPath(a, k), getPath(b, k));
      if (c !== 0) return dir < 0 ? -c : c;
    }
    return 0;
  });
}

function resolveField(doc, expr) {
  if (typeof expr !== "string") return expr;
  if (expr.startsWith("$")) return getPath(doc, expr.slice(1));
  return expr;
}

function loadAll(collection) {
  const stmt = sqlDb.prepare(`SELECT doc FROM documents WHERE collection = ?`);
  stmt.bind([collection]);
  const out = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const doc = parseDoc(row.doc);
    if (doc) out.push(doc);
  }
  stmt.free();
  return out;
}

function saveDoc(collection, doc) {
  if (doc._id == null) throw new Error("Documento sin _id");
  const id = idKey(doc._id);
  sqlDb.run(
    `INSERT INTO documents (collection, id, doc) VALUES (?, ?, ?)
     ON CONFLICT(collection, id) DO UPDATE SET doc = excluded.doc`,
    [collection, id, JSON.stringify(doc)]
  );
  persist();
}

function deleteById(collection, id) {
  sqlDb.run(`DELETE FROM documents WHERE collection = ? AND id = ?`, [collection, idKey(id)]);
  persist();
}

function runAggregate(collectionName, pipeline) {
  let docs = loadAll(collectionName);
  for (const stage of pipeline || []) {
    const op = Object.keys(stage)[0];
    const arg = stage[op];
    if (op === "$match") {
      docs = docs.filter((d) => matches(d, arg));
    } else if (op === "$unwind") {
      const field = String(arg).replace(/^\$/, "");
      const next = [];
      for (const d of docs) {
        const arr = getPath(d, field);
        if (!Array.isArray(arr)) continue;
        for (const item of arr) next.push({ ...d, [field]: item });
      }
      docs = next;
    } else if (op === "$group") {
      const groups = new Map();
      for (const d of docs) {
        const idVal = resolveField(d, arg._id);
        const key = idKey(idVal);
        if (!groups.has(key)) groups.set(key, { _id: idVal, __docs: [] });
        groups.get(key).__docs.push(d);
      }
      const out = [];
      for (const g of groups.values()) {
        const row = { _id: g._id };
        for (const [field, spec] of Object.entries(arg)) {
          if (field === "_id") continue;
          if (spec && typeof spec === "object" && "$sum" in spec) {
            let sum = 0;
            for (const d of g.__docs) {
              sum += spec.$sum === 1 ? 1 : Number(resolveField(d, spec.$sum) ?? 0) || 0;
            }
            row[field] = sum;
          }
        }
        out.push(row);
      }
      docs = out;
    } else if (op === "$sort") {
      docs = sortDocs(docs, arg);
    } else if (op === "$limit") {
      docs = docs.slice(0, Number(arg) || 0);
    } else if (op === "$lookup") {
      const fromDocs = loadAll(arg.from);
      docs = docs.map((d) => {
        const lv = getPath(d, arg.localField);
        return { ...d, [arg.as]: fromDocs.filter((f) => idKey(getPath(f, arg.foreignField)) === idKey(lv)) };
      });
    } else if (op === "$project") {
      docs = docs.map((d) => {
        const out = {};
        for (const [k, v] of Object.entries(arg)) {
          if (v === 0 || v === false) continue;
          if (v === 1 || v === true) out[k] = d[k];
          else if (typeof v === "string" && v.startsWith("$")) out[k] = resolveField(d, v);
          else out[k] = v;
        }
        if (arg._id === 0) delete out._id;
        return out;
      });
    } else {
      throw new Error(`Aggregate stage no soportado en SQLite local: ${op}`);
    }
  }
  return docs;
}

function makeCursor(collection, filter) {
  let projection = null;
  let sortSpec = null;
  let limitN = null;
  let skipN = 0;
  const cursor = {
    project(p) {
      projection = p;
      return cursor;
    },
    sort(s) {
      sortSpec = s;
      return cursor;
    },
    limit(n) {
      limitN = n == null ? null : Number(n);
      return cursor;
    },
    skip(n) {
      skipN = Number(n) || 0;
      return cursor;
    },
    async toArray() {
      let docs = loadAll(collection).filter((d) => matches(d, filter));
      docs = sortDocs(docs, sortSpec);
      if (skipN) docs = docs.slice(skipN);
      if (limitN != null && Number.isFinite(limitN)) docs = docs.slice(0, limitN);
      if (projection) docs = docs.map((d) => projectDoc(d, projection));
      return docs;
    },
  };
  return cursor;
}

function collectionApi(name) {
  return {
    async findOne(filter = {}, options = {}) {
      const docs = loadAll(name).filter((d) => matches(d, filter));
      let doc = docs[0] || null;
      if (doc && options.projection) doc = projectDoc(doc, options.projection);
      return doc;
    },
    find(filter = {}) {
      return makeCursor(name, filter);
    },
    aggregate(pipeline) {
      return {
        async toArray() {
          return runAggregate(name, pipeline);
        },
      };
    },
    async insertOne(doc) {
      const copy = { ...doc };
      if (copy._id == null) copy._id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      saveDoc(name, copy);
      return { acknowledged: true, insertedId: copy._id };
    },
    async updateOne(filter, update, options = {}) {
      const docs = loadAll(name).filter((d) => matches(d, filter));
      if (!docs.length) {
        if (options.upsert) {
          const base = { ...(update.$set || {}) };
          for (const [k, v] of Object.entries(filter || {})) {
            if (v != null && typeof v !== "object") base[k] = v;
          }
          if (base._id == null) {
            if (filter?._id != null) base._id = filter._id;
            else if (base.user_id != null && base.product_id != null) base._id = `${base.user_id}_${base.product_id}`;
            else base._id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
          }
          const created = applyUpdate(base, update);
          saveDoc(name, created);
          return { acknowledged: true, matchedCount: 0, modifiedCount: 1, upsertedCount: 1, upsertedId: created._id };
        }
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      saveDoc(name, applyUpdate(docs[0], update));
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, update, options = {}) {
      await this.updateOne(filter, update, options);
      const doc = await this.findOne(filter);
      return doc ? { value: doc, ...doc } : { value: null };
    },
    async replaceOne(filter, replacement, options = {}) {
      const docs = loadAll(name).filter((d) => matches(d, filter));
      const copy = { ...replacement };
      if (copy._id == null && filter?._id != null) copy._id = filter._id;
      if (copy._id == null && docs[0]?._id != null) copy._id = docs[0]._id;
      if (copy._id == null) copy._id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      if (!docs.length && !options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      saveDoc(name, copy);
      return { acknowledged: true, matchedCount: docs.length ? 1 : 0, modifiedCount: 1 };
    },
    async deleteOne(filter = {}) {
      const docs = loadAll(name).filter((d) => matches(d, filter));
      if (!docs.length) return { acknowledged: true, deletedCount: 0 };
      deleteById(name, docs[0]._id);
      return { acknowledged: true, deletedCount: 1 };
    },
    async deleteMany(filter = {}) {
      const docs = loadAll(name).filter((d) => matches(d, filter));
      for (const d of docs) deleteById(name, d._id);
      return { acknowledged: true, deletedCount: docs.length };
    },
    async countDocuments(filter = {}) {
      return loadAll(name).filter((d) => matches(d, filter)).length;
    },
    async distinct(field, filter = {}) {
      const docs = loadAll(name).filter((d) => matches(d, filter));
      const set = new Set();
      const out = [];
      for (const d of docs) {
        const v = getPath(d, field);
        const k = idKey(v);
        if (!set.has(k)) {
          set.add(k);
          out.push(v);
        }
      }
      return out;
    },
    async createIndex() {
      return `${name}_idx`;
    },
  };
}

export async function ensureSqliteReady() {
  await openSqlite();
  return getSqliteDb();
}

export function getSqliteDb() {
  if (!sqlDb) throw new Error("SQLite no inicializado. Llama ensureSqliteReady() primero.");
  return {
    collection(name) {
      return collectionApi(String(name));
    },
  };
}
