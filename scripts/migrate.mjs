/**
 * migrate.mjs
 * Initializes the SQLite database and seeds initial judges, hearings, and managed cases.
 * Run once: node scripts/migrate.mjs
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load .env
try {
  const envFile = readFileSync(path.join(ROOT, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const [key, ...vals] = line.split("=");
    if (key && vals.length && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  }
} catch {}

const dbPath =
  process.env.DATABASE_PATH || path.join(ROOT, "data", "lexmatch.db");
const dataDir = path.dirname(dbPath);
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

console.log(`📦 Initializing SQLite database at: ${dbPath}`);

const db = new Database(dbPath, { timeout: 5000 });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

try {
  // Apply schema — exec handles multiple statements in one call
  const schema = readFileSync(
    path.join(ROOT, "server", "db", "schema.sql"),
    "utf8",
  );
  // Strip PRAGMA lines (already set above), exec the rest
  const schemaNoPragma = schema
    .split("\n")
    .filter((l) => !l.trim().startsWith("PRAGMA"))
    .join("\n");
  db.exec(schemaNoPragma);
  console.log("✅ Schema applied");

  // ── Seed judges ──
  const insertJudge = db.prepare(
    `INSERT INTO judges (id, name, court_level, category, years_of_experience, case_load_capacity,
       current_case_load, availability, district, state, area, court_name, specializations)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       availability=excluded.availability,
       current_case_load=excluded.current_case_load,
       district=excluded.district, state=excluded.state,
       area=excluded.area, court_name=excluded.court_name,
       specializations=excluded.specializations`,
  );

  const judges = [
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
      area: "Central",
      courtName: "Supreme Court of India",
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
      area: "Central",
      courtName: "Delhi High Court",
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
      area: "West",
      courtName: "Bombay High Court",
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
      area: "East",
      courtName: "Calcutta High Court",
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
      area: "South",
      courtName: "City Civil Court",
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
      area: "South",
      courtName: "Madras High Court",
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
      area: "South",
      courtName: "Kerala High Court",
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
      area: "West",
      courtName: "Gujarat High Court",
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
      area: "South",
      courtName: "Karnataka High Court",
      specializations: ["Constitutional"],
    },
  ];

  const seedJudges = db.transaction(() => {
    for (const j of judges) {
      insertJudge.run(
        j.id,
        j.name,
        j.courtLevel,
        j.category,
        j.yearsOfExperience,
        j.caseLoadCapacity,
        j.currentCaseLoad,
        j.availability,
        j.district,
        j.state,
        j.area,
        j.courtName,
        JSON.stringify(j.specializations),
      );
    }
  });
  seedJudges();
  console.log(`✅ Seeded ${judges.length} judges`);

  // ── Seed hearings ──
  const today = new Date();
  const addDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const insertHearing = db.prepare(
    `INSERT INTO hearings (id, case_id, case_title, assigned_judge_id, assigned_judge_name,
       hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO NOTHING`,
  );

  const hearings = [
    {
      id: "hearing-seed-1",
      caseId: "case-101",
      caseTitle: "State vs. Ram Kumar (IPC 302)",
      assignedJudgeId: "judge-1",
      assignedJudgeName: "Justice N. Rao",
      hearingDate: addDays(2),
      hearingTime: "10:00",
      courtRoom: "Court Room 1",
      state: "Delhi",
      district: "New Delhi",
      localCourtName: "Delhi High Court",
      status: "Scheduled",
      notes: "First hearing on merits",
    },
    {
      id: "hearing-seed-2",
      caseId: "case-202",
      caseTitle: "Sharma & Co. vs. State of Maharashtra",
      assignedJudgeId: "judge-3",
      assignedJudgeName: "Justice R. Iyer",
      hearingDate: addDays(5),
      hearingTime: "14:00",
      courtRoom: "Court Room 3",
      state: "Maharashtra",
      district: "Mumbai",
      localCourtName: "Bombay High Court",
      status: "Scheduled",
      notes: "Arguments on admissibility",
    },
    {
      id: "hearing-seed-3",
      caseId: "case-managed-1",
      caseTitle: "State vs Kumar (Public Safety Review)",
      assignedJudgeId: "judge-1",
      assignedJudgeName: "Justice N. Rao",
      hearingDate: addDays(7),
      hearingTime: "11:00",
      courtRoom: "Court Room 2",
      state: "Delhi",
      district: "New Delhi",
      localCourtName: "Delhi High Court",
      status: "Scheduled",
      notes: "Priority case - urgent listing",
    },
  ];

  const seedHearings = db.transaction(() => {
    for (const h of hearings) {
      insertHearing.run(
        h.id,
        h.caseId,
        h.caseTitle,
        h.assignedJudgeId,
        h.assignedJudgeName,
        h.hearingDate,
        h.hearingTime,
        h.courtRoom,
        h.state,
        h.district,
        h.localCourtName,
        h.status,
        h.notes,
      );
    }
  });
  seedHearings();
  console.log(`✅ Seeded ${hearings.length} hearings`);

  // ── Seed managed cases ──
  const insertMc = db.prepare(
    `INSERT INTO managed_cases (id, title, status, assigned_judge, uploaded_by, notes, auto_assigned,
       assignment_reason, priority_score, priority_band, bail_risk_score, escape_risk_score,
       risk_score, public_defender_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO NOTHING`,
  );

  const managedCases = [
    {
      id: "case-managed-1",
      title: "State vs Kumar (Public Safety Review)",
      status: "Assigned",
      assignedJudge: "Justice N. Rao",
      uploadedBy: "Court Support Officer",
      notes: "Urgent listing requested by prosecution.",
      autoAssigned: 1,
      assignmentReason: "Selected for criminal bench fit.",
      priorityScore: 88,
      priorityBand: "P0",
      bailRiskScore: 79,
      escapeRiskScore: 72,
      riskScore: 76,
      publicDefenderStatus: "Pending Allocation",
    },
    {
      id: "case-managed-2",
      title: "Anita Sharma vs Metro Developers",
      status: "Under Review",
      assignedJudge: "Justice R. Iyer",
      uploadedBy: "Court Support Officer",
      notes: "Awaiting affidavit verification.",
      autoAssigned: 0,
      assignmentReason: "Manual assignment retained.",
      priorityScore: 62,
      priorityBand: "P2",
      bailRiskScore: 24,
      escapeRiskScore: 18,
      riskScore: 21,
      publicDefenderStatus: "Not Required",
    },
  ];

  const seedMc = db.transaction(() => {
    for (const mc of managedCases) {
      insertMc.run(
        mc.id,
        mc.title,
        mc.status,
        mc.assignedJudge,
        mc.uploadedBy,
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
    }
  });
  seedMc();
  console.log(`✅ Seeded ${managedCases.length} managed cases`);

  console.log("\n🚀 Migration complete! SQLite database is ready.");
  console.log("   DB file:", dbPath);
  console.log("   Start the API server: npm run dev:server");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  db.close();
}
