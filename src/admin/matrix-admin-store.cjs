const fs = require("fs");
const path = require("path");

const DEFAULT_STATE = {
  records: {},
  sessions: {},
  audit: [],
  researchSnapshots: {},
  researchSnapshotEvents: []
};

function createMatrixAdminStore({ dataDir, dbPath, DatabaseSync, now = () => Date.now() }) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (DatabaseSync) {
    return createSqliteStore({ dbPath, DatabaseSync, now });
  }
  return createJsonStore({ jsonPath: path.join(dataDir, "matrix-admin-store.json"), now });
}

function createSqliteStore({ dbPath, DatabaseSync, now }) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS admin_records (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_research_snapshots (
      symbol TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_research_snapshot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      value TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit (at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_research_snapshots_generated_at ON admin_research_snapshots (generated_at DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_research_snapshot_events_generated_at ON admin_research_snapshot_events (generated_at DESC, id DESC);
  `);

  const statements = {
    getRecord: db.prepare("SELECT value FROM admin_records WHERE key = "),
    upsertRecord: db.prepare(`
      INSERT INTO admin_records (key, value, updated_at)
      VALUES (, , )
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `),
    getSession: db.prepare("SELECT value FROM admin_sessions WHERE token = "),
    upsertSession: db.prepare(`
      INSERT INTO admin_sessions (token, value, expires_at, updated_at)
      VALUES (, , , )
      ON CONFLICT(token) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, updated_at = excluded.updated_at
    `),
    deleteSession: db.prepare("DELETE FROM admin_sessions WHERE token = "),
    pruneSessions: db.prepare("DELETE FROM admin_sessions WHERE expires_at <= "),
    insertAudit: db.prepare("INSERT INTO admin_audit (at, value) VALUES (, )"),
    pruneAudit: db.prepare("DELETE FROM admin_audit WHERE at < "),
    listAudit: db.prepare("SELECT id, at, value FROM admin_audit ORDER BY at DESC, id DESC LIMIT "),
    countAudit: db.prepare("SELECT COUNT(*) AS count FROM admin_audit"),
    countSessions: db.prepare("SELECT COUNT(*) AS count FROM admin_sessions"),
    upsertResearchSnapshot: db.prepare(`
      INSERT INTO admin_research_snapshots (symbol, value, generated_at, updated_at)
      VALUES (, , , )
      ON CONFLICT(symbol) DO UPDATE SET
        value = excluded.value,
        generated_at = excluded.generated_at,
        updated_at = excluded.updated_at
    `),
    insertResearchSnapshotEvent: db.prepare(`
      INSERT INTO admin_research_snapshot_events (symbol, value, generated_at, created_at)
      VALUES (, , , )
    `),
    listResearchSnapshots: db.prepare(`
      SELECT id, symbol, generated_at, value
      FROM admin_research_snapshot_events
      ORDER BY generated_at DESC, id DESC
      LIMIT 
    `),
    listLatestResearchSnapshots: db.prepare(`
      SELECT symbol, generated_at, value
      FROM admin_research_snapshots
      ORDER BY generated_at DESC, updated_at DESC, symbol ASC
      LIMIT 
    `),
    deleteResearchSnapshotEvents: db.prepare("DELETE FROM admin_research_snapshot_events"),
    deleteResearchSnapshots: db.prepare("DELETE FROM admin_research_snapshots"),
    countResearchSnapshots: db.prepare("SELECT COUNT(*) AS count FROM admin_research_snapshot_events"),
    countLatestResearchSnapshots: db.prepare("SELECT COUNT(*) AS count FROM admin_research_snapshots")
  };

  return {
    driver: "sqlite",
    storagePath: dbPath,
    getRecord(key, fallback = null) {
      const row = statements.getRecord.get(key);
      if (!row) return clone(fallback);
      return safeParse(row.value, fallback);
    },
    setRecord(key, value) {
      statements.upsertRecord.run(key, JSON.stringify(value), now());
      return clone(value);
    },
    getSession(token) {
      const row = statements.getSession.get(token);
      if (!row) return null;
      return safeParse(row.value, null);
    },
    setSession(session) {
      const normalized = clone(session);
      statements.upsertSession.run(normalized.token, JSON.stringify(normalized), Number(normalized.expiresAt) || 0, now());
      return normalized;
    },
    deleteSession(token) {
      statements.deleteSession.run(token);
    },
    pruneSessions(cutoff = now()) {
      statements.pruneSessions.run(cutoff);
    },
    addAudit(entry) {
      const normalized = clone(entry);
      statements.insertAudit.run(Number(normalized.at) || now(), JSON.stringify(normalized));
      return normalized;
    },
    pruneAudit(cutoff = 0) {
      statements.pruneAudit.run(Number(cutoff) || 0);
    },
    setResearchSnapshot(symbol, snapshot) {
      const normalized = clone(snapshot);
      const normalizedSymbol = String(symbol || normalized.symbol || "").trim().toUpperCase();
      const generatedAt = Number(normalized.generatedAt) || Math.floor(now() / 1000);
      const value = JSON.stringify({
        ...normalized,
        symbol: normalizedSymbol,
        generatedAt
      });
      statements.upsertResearchSnapshot.run(
        normalizedSymbol,
        value,
        generatedAt,
        now()
      );
      statements.insertResearchSnapshotEvent.run(normalizedSymbol, value, generatedAt, now());
      return {
        ...normalized,
        symbol: normalizedSymbol,
        generatedAt
      };
    },
    listResearchSnapshots(limit = 10) {
      const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
      const rows = statements.listResearchSnapshots.all(boundedLimit);
      const sourceRows = rows.length ? rows : statements.listLatestResearchSnapshots.all(boundedLimit);
      return sourceRows.map((row) => {
        const parsed = safeParse(row.value, {});
        return {
          ...parsed,
          id: row.id || parsed.id,
          symbol: String(parsed.symbol || row.symbol || "").trim().toUpperCase(),
          generatedAt: Number(parsed.generatedAt) || Number(row.generated_at) || 0
        };
      });
    },
    clearResearchSnapshots() {
      const before = Number(statements.countResearchSnapshots.get().count || statements.countLatestResearchSnapshots.get().count || 0);
      statements.deleteResearchSnapshotEvents.run();
      statements.deleteResearchSnapshots.run();
      return { deleted: before };
    },
    listAudit(limit = 50) {
      return statements.listAudit.all(Math.max(1, Math.min(Number(limit) || 50, 200))).map((row) => {
        const parsed = safeParse(row.value, {});
        return { id: row.id, ...parsed, at: Number(parsed.at) || row.at };
      });
    },
    getStats() {
      return {
        auditCount: Number(statements.countAudit.get().count || 0),
        activeSessions: Number(statements.countSessions.get().count || 0),
        researchSnapshotCount: Number(statements.countResearchSnapshots.get().count || statements.countLatestResearchSnapshots.get().count || 0)
      };
    }
  };
}

function createJsonStore({ jsonPath, now }) {
  let state = readJsonFile(jsonPath);
  if (!state) {
    state = clone(DEFAULT_STATE);
    flush();
  } else {
    state.records = state.records && typeof state.records === "object" ? state.records : {};
    state.sessions = state.sessions && typeof state.sessions === "object" ? state.sessions : {};
    state.audit = Array.isArray(state.audit) ? state.audit : [];
    state.researchSnapshots = state.researchSnapshots && typeof state.researchSnapshots === "object" ? state.researchSnapshots : {};
    state.researchSnapshotEvents = Array.isArray(state.researchSnapshotEvents) ? state.researchSnapshotEvents : [];
  }

  function flush() {
    fs.writeFileSync(jsonPath, JSON.stringify(state, null, 2), "utf8");
  }

  return {
    driver: "json",
    storagePath: jsonPath,
    getRecord(key, fallback = null) {
      if (!Object.hasOwn(state.records, key)) return clone(fallback);
      return clone(state.records[key]);
    },
    setRecord(key, value) {
      state.records[key] = clone(value);
      flush();
      return clone(value);
    },
    getSession(token) {
      return clone(state.sessions[token] || null);
    },
    setSession(session) {
      const normalized = clone(session);
      state.sessions[normalized.token] = normalized;
      flush();
      return normalized;
    },
    deleteSession(token) {
      delete state.sessions[token];
      flush();
    },
    pruneSessions(cutoff = now()) {
      for (const [token, session] of Object.entries(state.sessions)) {
        if (Number(session.expiresAt) <= cutoff) delete state.sessions[token];
      }
      flush();
    },
    addAudit(entry) {
      const normalized = clone(entry);
      state.audit.unshift(normalized);
      state.audit = state.audit.slice(0, 500);
      flush();
      return normalized;
    },
    pruneAudit(cutoff = 0) {
      const threshold = Number(cutoff) || 0;
      state.audit = state.audit.filter((entry) => Number(entry.at) >= threshold);
      flush();
    },
    setResearchSnapshot(symbol, snapshot) {
      const normalized = clone(snapshot);
      const normalizedSymbol = String(symbol || normalized.symbol || "").trim().toUpperCase();
      const generatedAt = Number(normalized.generatedAt) || Math.floor(now() / 1000);
      const nextSnapshot = {
        ...normalized,
        symbol: normalizedSymbol,
        generatedAt
      };
      state.researchSnapshots[normalizedSymbol] = nextSnapshot;
      state.researchSnapshotEvents.unshift({
        id: `research-${now()}-${state.researchSnapshotEvents.length + 1}`,
        ...nextSnapshot
      });
      state.researchSnapshotEvents = state.researchSnapshotEvents.slice(0, 500);
      flush();
      return clone(state.researchSnapshots[normalizedSymbol]);
    },
    listResearchSnapshots(limit = 10) {
      const boundedLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
      const source = state.researchSnapshotEvents.length ? state.researchSnapshotEvents : Object.values(state.researchSnapshots);
      return source
        .sort((left, right) => Number(right.generatedAt || 0) - Number(left.generatedAt || 0))
        .slice(0, boundedLimit)
        .map((snapshot) => clone(snapshot));
    },
    clearResearchSnapshots() {
      const deleted = state.researchSnapshotEvents.length || Object.keys(state.researchSnapshots).length;
      state.researchSnapshots = {};
      state.researchSnapshotEvents = [];
      flush();
      return { deleted };
    },
    listAudit(limit = 50) {
      return state.audit.slice(0, Math.max(1, Math.min(Number(limit) || 50, 200))).map((entry, index) => ({
        id: entry.id || index + 1,
        ...clone(entry)
      }));
    },
    getStats() {
      return {
        auditCount: state.audit.length,
        activeSessions: Object.keys(state.sessions).length,
        researchSnapshotCount: state.researchSnapshotEvents.length || Object.keys(state.researchSnapshots).length
      };
    }
  };
}

function readJsonFile(jsonPath) {
  try {
    return safeParse(fs.readFileSync(jsonPath, "utf8"), null);
  } catch {
    return null;
  }
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return clone(fallback);
  }
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createMatrixAdminStore
};
