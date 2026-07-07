const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "work", "data");
fs.mkdirSync(dataDir, { recursive: true });

const collections = {
  resumes: "resume_records.json",
  jds: "jd_records.json",
  reports: "match_reports.json",
  batchRuns: "batch_runs.json",
  clusters: "jd_clusters.json",
  variants: "resume_variants.json",
  users: "users.json",
  sessions: "sessions.json",
  vectorCache: "vector_cache.json",
};

function nowIso() {
  return new Date().toISOString();
}

function fileFor(name) {
  const filename = collections[name];
  if (!filename) throw new Error(`Unknown collection: ${name}`);
  return path.join(dataDir, filename);
}

function readCollection(name) {
  const file = fileFor(name);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCollection(name, items) {
  const file = fileFor(name);
  fs.writeFileSync(file, JSON.stringify(items, null, 2), "utf8");
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createRecord(name, record, prefix) {
  const items = readCollection(name);
  const createdAt = record.createdAt || nowIso();
  const next = {
    id: record.id || makeId(prefix),
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    status: record.status || "active",
    ...record,
  };
  items.unshift(next);
  writeCollection(name, items);
  return next;
}

function updateRecord(name, id, updater) {
  const items = readCollection(name);
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = items[index];
  const updated = {
    ...current,
    ...(typeof updater === "function" ? updater(current) : updater),
    updatedAt: nowIso(),
  };
  items[index] = updated;
  writeCollection(name, items);
  return updated;
}

function getRecord(name, id) {
  return readCollection(name).find((item) => item.id === id) || null;
}

function listRecords(name, limit = 20) {
  return readCollection(name).slice(0, limit);
}

function findRecords(name, predicate, limit = Infinity) {
  const items = readCollection(name).filter((item, index) => {
    if (typeof predicate !== "function") return true;
    return predicate(item, index);
  });
  return Number.isFinite(limit) ? items.slice(0, limit) : items;
}

function deleteRecord(name, id) {
  const items = readCollection(name);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  writeCollection(name, next);
  return true;
}

module.exports = {
  createRecord,
  updateRecord,
  getRecord,
  listRecords,
  findRecords,
  deleteRecord,
  readCollection,
  writeCollection,
  nowIso,
};
