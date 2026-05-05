/**
 * store.mjs — SQLite-backed data store (better-sqlite3) with in-memory fallback.
 * DB file path: process.env.DATABASE_PATH or <project-root>/data/lexmatch.db
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

// ── In-memory seed data (used when DB cannot be opened) ──────────────────
const memoryState = {
  judges: [
    {
      id: "judge-1",
      name: "Justice N. Rao",
      courtLevel: "Supreme Court",
      category: "Criminal",
      yearsOfExperience: 20,
      caseLoadCapacity: 50,
      currentCaseLoad: 38,
      availability: "Busy",
      district: "New Delhi",
      state: "Delhi",
      specializations: ["Criminal", "Constitutional"],
    },
    {
      id: "judge-2",
      name: "Justice P. Mehta",
      courtLevel: "High Court",
      category: "Criminal",
      yearsOfExperience: 15,
      caseLoadCapacity: 60,
      currentCaseLoad: 42,
      availability: "Available",
      district: "New Delhi",
      state: "Delhi",
      specializations: ["Criminal"],
    },
    {
      id: "judge-3",
      name: "Justice R. Iyer",
      courtLevel: "High Court",
      category: "Civil",
      yearsOfExperience: 18,
      caseLoadCapacity: 55,
      currentCaseLoad: 28,
      availability: "Available",
      district: "Mumbai",
      state: "Maharashtra",
      specializations: ["Civil", "Commercial"],
    },
    {
      id: "judge-4",
      name: "Justice K. Banerjee",
      courtLevel: "High Court",
      category: "Civil",
      yearsOfExperience: 22,
      caseLoadCapacity: 50,
      currentCaseLoad: 31,
      availability: "Available",
      district: "Kolkata",
      state: "West Bengal",
      specializations: ["Civil", "Labor"],
    },
    {
      id: "judge-5",
      name: "Justice S. Khan",
      courtLevel: "District Court",
      category: "Criminal",
      yearsOfExperience: 10,
      caseLoadCapacity: 70,
      currentCaseLoad: 55,
      availability: "Busy",
      district: "Hyderabad",
      state: "Telangana",
      specializations: ["Criminal"],
    },
    {
      id: "judge-6",
      name: "Justice V. Sen",
      courtLevel: "High Court",
      category: "Civil",
      yearsOfExperience: 16,
      caseLoadCapacity: 55,
      currentCaseLoad: 20,
      availability: "Available",
      district: "Chennai",
      state: "Tamil Nadu",
      specializations: ["Civil", "Revenue"],
    },
    {
      id: "judge-7",
      name: "Justice A. Menon",
      courtLevel: "District Court",
      category: "Other",
      yearsOfExperience: 12,
      caseLoadCapacity: 65,
      currentCaseLoad: 48,
      availability: "Available",
      district: "Kochi",
      state: "Kerala",
      specializations: ["Constitutional", "Labor"],
    },
    {
      id: "judge-8",
      name: "Justice D. Kapoor",
      courtLevel: "District Court",
      category: "Other",
      yearsOfExperience: 8,
      caseLoadCapacity: 70,
      currentCaseLoad: 35,
      availability: "Available",
      district: "Ahmedabad",
      state: "Gujarat",
      specializations: ["Commercial", "Revenue"],
    },
    {
      id: "judge-9",
      name: "Justice T. Joseph",
      courtLevel: "District Court",
      category: "Other",
      yearsOfExperience: 14,
      caseLoadCapacity: 60,
      currentCaseLoad: 40,
      availability: "On Leave",
      district: "Bengaluru",
      state: "Karnataka",
      specializations: ["Constitutional"],
    },
  ],
  hearings: [
    {
      id: "hearing-1",
      caseId: "case-101",
      caseTitle: "State vs. Ram Kumar",
      assignedJudgeId: "judge-1",
      assignedJudgeName: "Justice N. Rao",
      hearingDate: "2025-06-15",
      hearingTime: "10:00",
      courtRoom: "Court Room 1",
      state: "Delhi",
      district: "New Delhi",
      localCourtName: "Delhi High Court",
      status: "Scheduled",
      notes: "First hearing on merits",
    },
    {
      id: "hearing-2",
      caseId: "case-202",
      caseTitle: "Sharma & Co. vs. State",
      assignedJudgeId: "judge-3",
      assignedJudgeName: "Justice R. Iyer",
      hearingDate: "2025-06-20",
      hearingTime: "14:00",
      courtRoom: "Court Room 3",
      state: "Maharashtra",
      district: "Mumbai",
      localCourtName: "Bombay High Court",
      status: "Scheduled",
      notes: "Arguments on admissibility",
    },
  ],
  managedCases: [
    {
      id: "case-managed-1",
      title: "State vs Kumar (Public Safety Review)",
      status: "Assigned",
      assignedJudge: "Justice N. Rao",
      uploadedBy: "Court Support Officer",
      notes: "Urgent listing requested by prosecution.",
      autoAssigned: true,
      assignmentReason: "Selected for criminal bench fit.",
      priorityScore: 88,
      priorityBand: "P0",
      bailRiskScore: 79,
      escapeRiskScore: 72,
      riskScore: 76,
      publicDefenderStatus: "Pending Allocation",
      updatedAt: Date.now(),
    },
    {
      id: "case-managed-2",
      title: "Anita Sharma vs Metro Developers",
      status: "Under Review",
      assignedJudge: "Justice R. Iyer",
      uploadedBy: "Court Support Officer",
      notes: "Awaiting affidavit verification.",
      autoAssigned: false,
      assignmentReason: "Manual assignment retained.",
      priorityScore: 62,
      priorityBand: "P2",
      bailRiskScore: 24,
      escapeRiskScore: 18,
      riskScore: 21,
      publicDefenderStatus: "Not Required",
      updatedAt: Date.now(),
    },
  ],
  history: [],
};

// ── DB singleton ──────────────────────────────────────────────────────────
let db = null;
let dbAvailable = false;

function getDb() {
  if (db) return dbAvailable ? db : null;

  try {
    const dbPath =
      process.env.DATABASE_PATH || path.join(ROOT, "data", "lexmatch.db");

    const dir = path.dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    db = new Database(dbPath, { timeout: 5000 });
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Apply schema
    const schemaPath = path.join(__dirname, "schema.sql");
    const schema = readFileSync(schemaPath, "utf8");
    const schemaNoPragma = schema
      .split("\n")
      .filter((l) => !l.trim().startsWith("PRAGMA"))
      .join("\n");
    db.exec(schemaNoPragma);

    dbAvailable = true;
    console.log(`✅ [store] SQLite connected: ${dbPath}`);
    return db;
  } catch (err) {
    dbAvailable = false;
    console.warn(
      "⚠️  [store] SQLite unavailable — using in-memory store.",
      err.message,
    );
    return null;
  }
}

function nextId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

// ── Row mappers ───────────────────────────────────────────────────────────
function mapJudgeRow(row) {
  return {
    id: row.id,
    name: row.name,
    courtLevel: row.court_level,
    category: row.category,
    yearsOfExperience: row.years_of_experience,
    caseLoadCapacity: row.case_load_capacity,
    currentCaseLoad: row.current_case_load,
    availability: row.availability,
    district: row.district || undefined,
    state: row.state || undefined,
    area: row.area || undefined,
    courtName: row.court_name || undefined,
    specializations: row.specializations ? JSON.parse(row.specializations) : [],
  };
}

function mapHearingRow(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    caseTitle: row.case_title,
    assignedJudgeId: row.assigned_judge_id,
    assignedJudgeName: row.assigned_judge_name,
    hearingDate: row.hearing_date,
    hearingTime: row.hearing_time,
    courtRoom: row.court_room,
    state: row.state,
    district: row.district,
    localCourtName: row.local_court_name,
    status: row.status,
    notes: row.notes || "",
  };
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    date: row.event_date,
    results: row.results,
  };
}

function mapManagedCaseRow(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assignedJudge: row.assigned_judge,
    uploadedBy: row.uploaded_by,
    uploadName: row.upload_name || undefined,
    notes: row.notes || "",
    autoAssigned: Boolean(row.auto_assigned),
    assignmentReason: row.assignment_reason || undefined,
    priorityScore:
      row.priority_score != null ? Number(row.priority_score) : undefined,
    priorityBand: row.priority_band || undefined,
    bailRiskScore:
      row.bail_risk_score != null ? Number(row.bail_risk_score) : undefined,
    escapeRiskScore:
      row.escape_risk_score != null ? Number(row.escape_risk_score) : undefined,
    riskScore: row.risk_score != null ? Number(row.risk_score) : undefined,
    publicDefenderStatus: row.public_defender_status || undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

// ── Judges ────────────────────────────────────────────────────────────────
export async function listJudges() {
  const database = getDb();
  if (database) {
    const rows = database
      .prepare(
        `SELECT id, name, court_level, category, years_of_experience, case_load_capacity,
              current_case_load, availability, district, state, area, court_name, specializations
       FROM judges ORDER BY name ASC`,
      )
      .all();
    return rows.map(mapJudgeRow);
  }
  return memoryState.judges
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getJudgeById(id) {
  const database = getDb();
  if (database) {
    const row = database
      .prepare(
        `SELECT id, name, court_level, category, years_of_experience, case_load_capacity,
              current_case_load, availability, district, state, area, court_name, specializations
       FROM judges WHERE id = ?`,
      )
      .get(id);
    return row ? mapJudgeRow(row) : null;
  }
  return memoryState.judges.find((j) => j.id === id) || null;
}

export async function createJudge(input) {
  const judge = {
    id: input.id || nextId("judge"),
    name: `${input.name || ""}`.trim(),
    courtLevel: input.courtLevel || "District Court",
    category: input.category || "Other",
    yearsOfExperience: parseInt(`${input.yearsOfExperience || 0}`, 10) || 0,
    caseLoadCapacity: parseInt(`${input.caseLoadCapacity || 50}`, 10) || 50,
    currentCaseLoad: parseInt(`${input.currentCaseLoad || 0}`, 10) || 0,
    availability: input.availability || "Available",
    district: input.district || null,
    state: input.state || null,
    area: input.area || null,
    courtName: input.courtName || null,
    specializations: Array.isArray(input.specializations)
      ? input.specializations
      : [],
  };

  const database = getDb();
  if (database) {
    database
      .prepare(
        `INSERT INTO judges (id, name, court_level, category, years_of_experience, case_load_capacity,
         current_case_load, availability, district, state, area, court_name, specializations)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        judge.id,
        judge.name,
        judge.courtLevel,
        judge.category,
        judge.yearsOfExperience,
        judge.caseLoadCapacity,
        judge.currentCaseLoad,
        judge.availability,
        judge.district,
        judge.state,
        judge.area,
        judge.courtName,
        JSON.stringify(judge.specializations),
      );
    return (await getJudgeById(judge.id)) || judge;
  }
  memoryState.judges.push(judge);
  return judge;
}

export async function updateJudge(id, updates) {
  const current = await getJudgeById(id);
  if (!current) return null;
  const merged = { ...current, ...updates };

  const database = getDb();
  if (database) {
    database
      .prepare(
        `UPDATE judges SET name=?, court_level=?, category=?, years_of_experience=?,
         case_load_capacity=?, current_case_load=?, availability=?,
         district=?, state=?, area=?, court_name=?, specializations=?,
         updated_at=datetime('now')
       WHERE id=?`,
      )
      .run(
        merged.name,
        merged.courtLevel,
        merged.category,
        merged.yearsOfExperience,
        merged.caseLoadCapacity,
        merged.currentCaseLoad,
        merged.availability,
        merged.district || null,
        merged.state || null,
        merged.area || null,
        merged.courtName || null,
        JSON.stringify(merged.specializations || []),
        id,
      );
    return (await getJudgeById(id)) || merged;
  }
  memoryState.judges = memoryState.judges.map((j) =>
    j.id === id ? merged : j,
  );
  return merged;
}

export async function deleteJudge(id) {
  const database = getDb();
  if (database) {
    const info = database.prepare("DELETE FROM judges WHERE id=?").run(id);
    return info.changes > 0;
  }
  const prev = memoryState.judges.length;
  memoryState.judges = memoryState.judges.filter((j) => j.id !== id);
  return prev !== memoryState.judges.length;
}

// ── Hearings ──────────────────────────────────────────────────────────────
export async function listHearings(filters = {}) {
  const database = getDb();
  if (database) {
    const clauses = [];
    const params = [];
    if (filters.caseId) {
      clauses.push("case_id=?");
      params.push(filters.caseId);
    }
    if (filters.judgeId) {
      clauses.push("assigned_judge_id=?");
      params.push(filters.judgeId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = database
      .prepare(
        `SELECT id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date,
              hearing_time, court_room, state, district, local_court_name, status, notes
       FROM hearings ${where} ORDER BY hearing_date ASC, hearing_time ASC`,
      )
      .all(...params);
    return rows.map(mapHearingRow);
  }
  return memoryState.hearings
    .filter((h) => {
      if (filters.caseId && h.caseId !== filters.caseId) return false;
      if (filters.judgeId && h.assignedJudgeId !== filters.judgeId)
        return false;
      return true;
    })
    .sort((a, b) =>
      `${a.hearingDate}T${a.hearingTime}`.localeCompare(
        `${b.hearingDate}T${b.hearingTime}`,
      ),
    );
}

export async function getHearingById(id) {
  const database = getDb();
  if (database) {
    const row = database
      .prepare(
        `SELECT id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date,
              hearing_time, court_room, state, district, local_court_name, status, notes
       FROM hearings WHERE id=?`,
      )
      .get(id);
    return row ? mapHearingRow(row) : null;
  }
  return memoryState.hearings.find((h) => h.id === id) || null;
}

export async function createHearing(input) {
  const hearing = {
    id: input.id || nextId("hearing"),
    caseId: input.caseId || "",
    caseTitle: input.caseTitle || "",
    assignedJudgeId: input.assignedJudgeId || "",
    assignedJudgeName: input.assignedJudgeName || "",
    hearingDate: input.hearingDate || new Date().toISOString().split("T")[0],
    hearingTime: input.hearingTime || "10:00",
    courtRoom: input.courtRoom || "",
    state: input.state || "",
    district: input.district || "",
    localCourtName: input.localCourtName || "",
    status: input.status || "Scheduled",
    notes: input.notes || "",
  };

  // ── Scheduling conflict guard ─────────────────────────────────────────────
  // Normalize time to "HH:MM" for reliable comparison (strip seconds if present)
  const normalizeTime = (t) => `${t || ""}`.trim().slice(0, 5);
  const slotTime = normalizeTime(hearing.hearingTime);

  const database = getDb();
  if (database) {
    const conflict = database
      .prepare(
        `SELECT id, case_title FROM hearings
       WHERE assigned_judge_id = ?
         AND hearing_date = ?
         AND substr(hearing_time, 1, 5) = ?
         AND id != ?
       LIMIT 1`,
      )
      .get(hearing.assignedJudgeId, hearing.hearingDate, slotTime, hearing.id);

    if (conflict) {
      throw new Error(
        `Scheduling conflict: ${hearing.assignedJudgeName} already has a hearing on ` +
          `${hearing.hearingDate} at ${slotTime} (Case: "${conflict.case_title}"). ` +
          `Please choose a different time or date.`,
      );
    }

    database
      .prepare(
        `INSERT INTO hearings (id, case_id, case_title, assigned_judge_id, assigned_judge_name,
         hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        hearing.id,
        hearing.caseId,
        hearing.caseTitle,
        hearing.assignedJudgeId,
        hearing.assignedJudgeName,
        hearing.hearingDate,
        hearing.hearingTime,
        hearing.courtRoom,
        hearing.state,
        hearing.district,
        hearing.localCourtName,
        hearing.status,
        hearing.notes,
      );
    return (await getHearingById(hearing.id)) || hearing;
  }

  // In-memory fallback conflict check
  const existingSlot = memoryState.hearings.find(
    (h) =>
      h.assignedJudgeId === hearing.assignedJudgeId &&
      h.hearingDate === hearing.hearingDate &&
      normalizeTime(h.hearingTime) === slotTime &&
      h.id !== hearing.id,
  );
  if (existingSlot) {
    throw new Error(
      `Scheduling conflict: ${hearing.assignedJudgeName} already has a hearing on ` +
        `${hearing.hearingDate} at ${slotTime} (Case: "${existingSlot.caseTitle}"). ` +
        `Please choose a different time or date.`,
    );
  }

  memoryState.hearings.push(hearing);
  return hearing;
}

export async function updateHearing(id, updates) {
  const current = await getHearingById(id);
  if (!current) return null;
  const merged = { ...current, ...updates };

  const database = getDb();
  if (database) {
    database
      .prepare(
        `UPDATE hearings SET case_id=?, case_title=?, assigned_judge_id=?, assigned_judge_name=?,
         hearing_date=?, hearing_time=?, court_room=?, state=?, district=?,
         local_court_name=?, status=?, notes=?, updated_at=datetime('now')
       WHERE id=?`,
      )
      .run(
        merged.caseId,
        merged.caseTitle,
        merged.assignedJudgeId,
        merged.assignedJudgeName,
        merged.hearingDate,
        merged.hearingTime,
        merged.courtRoom,
        merged.state,
        merged.district,
        merged.localCourtName,
        merged.status,
        merged.notes,
        id,
      );
    return (await getHearingById(id)) || merged;
  }
  memoryState.hearings = memoryState.hearings.map((h) =>
    h.id === id ? merged : h,
  );
  return merged;
}

export async function deleteHearing(id) {
  const database = getDb();
  if (database) {
    const info = database.prepare("DELETE FROM hearings WHERE id=?").run(id);
    return info.changes > 0;
  }
  const prev = memoryState.hearings.length;
  memoryState.hearings = memoryState.hearings.filter((h) => h.id !== id);
  return prev !== memoryState.hearings.length;
}

// ── Activity History ──────────────────────────────────────────────────────
export async function listHistory() {
  const database = getDb();
  if (database) {
    const rows = database
      .prepare(
        `SELECT id, type, title, event_date, results
       FROM activity_history ORDER BY event_date DESC LIMIT 100`,
      )
      .all();
    return rows.map(mapHistoryRow);
  }
  return memoryState.history
    .slice()
    .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
}

export async function createHistoryEvent(input) {
  const event = {
    id: input.id || nextId("hist"),
    type: input.type || "view",
    title: `${input.title || ""}`.slice(0, 500),
    date: input.date || new Date().toISOString(),
    results: Number.isFinite(input.results) ? input.results : null,
  };

  const database = getDb();
  if (database) {
    database
      .prepare(
        `INSERT INTO activity_history (id, type, title, event_date, results, metadata)
       VALUES (?,?,?,?,?,?)`,
      )
      .run(
        event.id,
        event.type,
        event.title,
        event.date,
        event.results,
        JSON.stringify(input.metadata || {}),
      );
    return event;
  }
  memoryState.history.unshift(event);
  return event;
}

// ── Managed Cases ─────────────────────────────────────────────────────────
export async function listManagedCases() {
  const database = getDb();
  if (database) {
    const rows = database
      .prepare(
        `SELECT id, title, status, assigned_judge, uploaded_by, upload_name, notes,
              auto_assigned, assignment_reason, priority_score, priority_band,
              bail_risk_score, escape_risk_score, risk_score, public_defender_status, updated_at
       FROM managed_cases ORDER BY updated_at DESC`,
      )
      .all();
    return rows.map(mapManagedCaseRow);
  }
  return memoryState.managedCases.slice();
}

export async function upsertManagedCase(input) {
  const mc = {
    id: input.id || nextId("mc"),
    title: `${input.title || ""}`.trim(),
    status: input.status || "New",
    assignedJudge: input.assignedJudge || "Unassigned",
    uploadedBy: input.uploadedBy || "Unknown",
    uploadName: input.uploadName || null,
    notes: input.notes || "",
    autoAssigned: Boolean(input.autoAssigned) ? 1 : 0,
    assignmentReason: input.assignmentReason || null,
    priorityScore: Number.isFinite(input.priorityScore)
      ? input.priorityScore
      : null,
    priorityBand: input.priorityBand || null,
    bailRiskScore: Number.isFinite(input.bailRiskScore)
      ? input.bailRiskScore
      : null,
    escapeRiskScore: Number.isFinite(input.escapeRiskScore)
      ? input.escapeRiskScore
      : null,
    riskScore: Number.isFinite(input.riskScore) ? input.riskScore : null,
    publicDefenderStatus: input.publicDefenderStatus || "Not Required",
  };

  const database = getDb();
  if (database) {
    database
      .prepare(
        `INSERT INTO managed_cases (id, title, status, assigned_judge, uploaded_by, upload_name, notes,
         auto_assigned, assignment_reason, priority_score, priority_band, bail_risk_score,
         escape_risk_score, risk_score, public_defender_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, status=excluded.status, assigned_judge=excluded.assigned_judge,
         uploaded_by=excluded.uploaded_by, upload_name=excluded.upload_name, notes=excluded.notes,
         auto_assigned=excluded.auto_assigned, assignment_reason=excluded.assignment_reason,
         priority_score=excluded.priority_score, priority_band=excluded.priority_band,
         bail_risk_score=excluded.bail_risk_score, escape_risk_score=excluded.escape_risk_score,
         risk_score=excluded.risk_score, public_defender_status=excluded.public_defender_status,
         updated_at=datetime('now')`,
      )
      .run(
        mc.id,
        mc.title,
        mc.status,
        mc.assignedJudge,
        mc.uploadedBy,
        mc.uploadName,
        mc.notes,
        mc.autoAssigned,
        mc.assignmentReason,
        mc.priorityScore,
        mc.priorityBand,
        mc.bailRiskScore,
        mc.escapeRiskScore,
        mc.riskScore,
        mc.publicDefenderStatus,
      );
    const row = database
      .prepare("SELECT * FROM managed_cases WHERE id=?")
      .get(mc.id);
    return row ? mapManagedCaseRow(row) : { ...mc, updatedAt: Date.now() };
  }

  const idx = memoryState.managedCases.findIndex((c) => c.id === mc.id);
  const full = {
    ...mc,
    autoAssigned: Boolean(mc.autoAssigned),
    updatedAt: Date.now(),
  };
  if (idx >= 0) memoryState.managedCases[idx] = full;
  else memoryState.managedCases.unshift(full);
  return full;
}

export async function updateManagedCase(id, updates) {
  const database = getDb();
  let current;
  if (database) {
    const row = database
      .prepare("SELECT * FROM managed_cases WHERE id=?")
      .get(id);
    current = row ? mapManagedCaseRow(row) : null;
  } else {
    current = memoryState.managedCases.find((c) => c.id === id) || null;
  }
  if (!current) return null;
  return upsertManagedCase({ ...current, ...updates, id });
}

export async function deleteManagedCase(id) {
  const database = getDb();
  if (database) {
    const info = database
      .prepare("DELETE FROM managed_cases WHERE id=?")
      .run(id);
    return info.changes > 0;
  }
  const prev = memoryState.managedCases.length;
  memoryState.managedCases = memoryState.managedCases.filter(
    (c) => c.id !== id,
  );
  return prev !== memoryState.managedCases.length;
}

// ── Priority Overrides ────────────────────────────────────────────────────
export async function createPriorityOverride(input) {
  const database = getDb();
  if (database) {
    const info = database
      .prepare(
        `INSERT INTO priority_overrides (case_id, original_band, override_band, original_score, override_score, reason, overridden_by)
       VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        input.caseId,
        input.originalBand || null,
        input.overrideBand,
        input.originalScore || null,
        input.overrideScore || null,
        input.reason,
        input.overriddenBy || "staff",
      );
    return {
      id: info.lastInsertRowid,
      ...input,
      createdAt: new Date().toISOString(),
    };
  }
  return { id: nextId("po"), ...input, createdAt: new Date().toISOString() };
}

export async function listPriorityOverrides(caseId) {
  const database = getDb();
  if (database) {
    return database
      .prepare(
        `SELECT id, case_id, original_band, override_band, original_score, override_score,
              reason, overridden_by, created_at
       FROM priority_overrides WHERE case_id=? ORDER BY created_at DESC`,
      )
      .all(caseId);
  }
  return [];
}

// ── Health check ──────────────────────────────────────────────────────────
export async function checkDbHealth() {
  try {
    const database = getDb();
    if (!database)
      return {
        ok: false,
        mode: "memory",
        message: "SQLite unavailable or not initialized",
      };
    database.prepare("SELECT 1").get();
    return { ok: true, mode: "sqlite", message: "SQLite connected" };
  } catch (e) {
    return { ok: false, mode: "memory", message: e.message };
  }
}
