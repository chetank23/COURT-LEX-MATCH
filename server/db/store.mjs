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
		},
	],
	hearings: [
		{
			id: "hearing-1",
			caseId: "case-101",
			caseTitle: "State vs. Ram Kumar",
			assignedJudgeId: "judge-1",
			assignedJudgeName: "Justice N. Rao",
			hearingDate: "2025-01-28",
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
			assignedJudgeId: "judge-2",
			assignedJudgeName: "Justice P. Mehta",
			hearingDate: "2025-01-30",
			hearingTime: "14:00",
			courtRoom: "Court Room 3",
			state: "Maharashtra",
			district: "Mumbai",
			localCourtName: "Bombay High Court",
			status: "Scheduled",
			notes: "Arguments on admissibility",
		},
	],
	history: [],
};

let pgPool = null;
let pgLoadAttempted = false;

function nextId(prefix) {
	return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

async function getPool() {
	if (!process.env.DATABASE_URL) return null;
	if (pgPool) return pgPool;
	if (pgLoadAttempted) return null;

	pgLoadAttempted = true;
	try {
		const pg = await import("pg");
		pgPool = new pg.Pool({
			connectionString: process.env.DATABASE_URL,
			ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
		});
		return pgPool;
	} catch (error) {
		console.warn("PostgreSQL module unavailable. Using in-memory store.", error instanceof Error ? error.message : "");
		return null;
	}
}

async function runQuery(sql, params = []) {
	const pool = await getPool();
	if (!pool) return null;

	try {
		return await pool.query(sql, params);
	} catch (error) {
		console.warn("PostgreSQL query failed. Falling back to in-memory store.", error instanceof Error ? error.message : "");
		return null;
	}
}

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

export async function listJudges() {
	const result = await runQuery(
		`SELECT id, name, court_level, category, years_of_experience, case_load_capacity, current_case_load, availability
		 FROM judges
		 ORDER BY name ASC`
	);

	if (result) return result.rows.map(mapJudgeRow);
	return memoryState.judges.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function getJudgeById(id) {
	const result = await runQuery(
		`SELECT id, name, court_level, category, years_of_experience, case_load_capacity, current_case_load, availability
		 FROM judges WHERE id = $1`,
		[id]
	);
	if (result) return result.rows[0] ? mapJudgeRow(result.rows[0]) : null;
	return memoryState.judges.find((judge) => judge.id === id) || null;
}

export async function createJudge(input) {
	const judge = {
		id: input.id || nextId("judge"),
		name: input.name || "",
		courtLevel: input.courtLevel || "District Court",
		category: input.category || "Other",
		yearsOfExperience: Number.parseInt(`${input.yearsOfExperience || 0}`, 10) || 0,
		caseLoadCapacity: Number.parseInt(`${input.caseLoadCapacity || 0}`, 10) || 0,
		currentCaseLoad: Number.parseInt(`${input.currentCaseLoad || 0}`, 10) || 0,
		availability: input.availability || "Available",
	};

	const result = await runQuery(
		`INSERT INTO judges (id, name, court_level, category, years_of_experience, case_load_capacity, current_case_load, availability)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING id, name, court_level, category, years_of_experience, case_load_capacity, current_case_load, availability`,
		[
			judge.id,
			judge.name,
			judge.courtLevel,
			judge.category,
			judge.yearsOfExperience,
			judge.caseLoadCapacity,
			judge.currentCaseLoad,
			judge.availability,
		]
	);

	if (result) return mapJudgeRow(result.rows[0]);

	memoryState.judges.push(judge);
	return judge;
}

export async function updateJudge(id, updates) {
	const current = await getJudgeById(id);
	if (!current) return null;

	const merged = { ...current, ...updates };

	const result = await runQuery(
		`UPDATE judges
		 SET name = $2,
				 court_level = $3,
				 category = $4,
				 years_of_experience = $5,
				 case_load_capacity = $6,
				 current_case_load = $7,
				 availability = $8
		 WHERE id = $1
		 RETURNING id, name, court_level, category, years_of_experience, case_load_capacity, current_case_load, availability`,
		[
			id,
			merged.name,
			merged.courtLevel,
			merged.category,
			merged.yearsOfExperience,
			merged.caseLoadCapacity,
			merged.currentCaseLoad,
			merged.availability,
		]
	);

	if (result) return mapJudgeRow(result.rows[0]);

	memoryState.judges = memoryState.judges.map((judge) => (judge.id === id ? merged : judge));
	return merged;
}

export async function deleteJudge(id) {
	const result = await runQuery("DELETE FROM judges WHERE id = $1", [id]);
	if (result) return result.rowCount > 0;

	const previousLength = memoryState.judges.length;
	memoryState.judges = memoryState.judges.filter((judge) => judge.id !== id);
	return previousLength !== memoryState.judges.length;
}

export async function listHearings(filters = {}) {
	const clauses = [];
	const params = [];

	if (filters.caseId) {
		params.push(filters.caseId);
		clauses.push(`case_id = $${params.length}`);
	}
	if (filters.judgeId) {
		params.push(filters.judgeId);
		clauses.push(`assigned_judge_id = $${params.length}`);
	}

	const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
	const result = await runQuery(
		`SELECT id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes
		 FROM hearings
		 ${whereSql}
		 ORDER BY hearing_date ASC, hearing_time ASC`,
		params
	);

	if (result) return result.rows.map(mapHearingRow);

	return memoryState.hearings
		.filter((hearing) => {
			if (filters.caseId && hearing.caseId !== filters.caseId) return false;
			if (filters.judgeId && hearing.assignedJudgeId !== filters.judgeId) return false;
			return true;
		})
		.slice()
		.sort((a, b) => {
			const aKey = `${a.hearingDate}T${a.hearingTime}`;
			const bKey = `${b.hearingDate}T${b.hearingTime}`;
			return aKey.localeCompare(bKey);
		});
}

export async function getHearingById(id) {
	const result = await runQuery(
		`SELECT id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes
		 FROM hearings
		 WHERE id = $1`,
		[id]
	);

	if (result) return result.rows[0] ? mapHearingRow(result.rows[0]) : null;
	return memoryState.hearings.find((hearing) => hearing.id === id) || null;
}

export async function createHearing(input) {
	const hearing = {
		id: input.id || nextId("hearing"),
		caseId: input.caseId || "",
		caseTitle: input.caseTitle || "",
		assignedJudgeId: input.assignedJudgeId || "",
		assignedJudgeName: input.assignedJudgeName || "",
		hearingDate: input.hearingDate || "",
		hearingTime: input.hearingTime || "",
		courtRoom: input.courtRoom || "",
		state: input.state || "",
		district: input.district || "",
		localCourtName: input.localCourtName || "",
		status: input.status || "Scheduled",
		notes: input.notes || "",
	};

	const result = await runQuery(
		`INSERT INTO hearings (id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		 RETURNING id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes`,
		[
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
		]
	);

	if (result) return mapHearingRow(result.rows[0]);

	memoryState.hearings.push(hearing);
	return hearing;
}

export async function updateHearing(id, updates) {
	const current = await getHearingById(id);
	if (!current) return null;

	const merged = { ...current, ...updates };
	const result = await runQuery(
		`UPDATE hearings
		 SET case_id = $2,
				 case_title = $3,
				 assigned_judge_id = $4,
				 assigned_judge_name = $5,
				 hearing_date = $6,
				 hearing_time = $7,
				 court_room = $8,
				 state = $9,
				 district = $10,
				 local_court_name = $11,
				 status = $12,
				 notes = $13
		 WHERE id = $1
		 RETURNING id, case_id, case_title, assigned_judge_id, assigned_judge_name, hearing_date, hearing_time, court_room, state, district, local_court_name, status, notes`,
		[
			id,
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
		]
	);

	if (result) return mapHearingRow(result.rows[0]);

	memoryState.hearings = memoryState.hearings.map((hearing) => (hearing.id === id ? merged : hearing));
	return merged;
}

export async function deleteHearing(id) {
	const result = await runQuery("DELETE FROM hearings WHERE id = $1", [id]);
	if (result) return result.rowCount > 0;

	const previousLength = memoryState.hearings.length;
	memoryState.hearings = memoryState.hearings.filter((hearing) => hearing.id !== id);
	return previousLength !== memoryState.hearings.length;
}

export async function listHistory() {
	const result = await runQuery(
		`SELECT id, type, title, event_date, results
		 FROM activity_history
		 ORDER BY event_date DESC
		 LIMIT 100`
	);

	if (result) return result.rows.map(mapHistoryRow);

	return memoryState.history
		.slice()
		.sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
}

export async function createHistoryEvent(input) {
	const event = {
		id: input.id || nextId("hist"),
		type: input.type || "view",
		title: input.title || "",
		date: input.date || new Date().toISOString(),
		results: Number.isFinite(input.results) ? input.results : null,
	};

	const result = await runQuery(
		`INSERT INTO activity_history (id, type, title, event_date, results, metadata)
		 VALUES ($1,$2,$3,$4,$5,$6::jsonb)
		 RETURNING id, type, title, event_date, results`,
		[event.id, event.type, event.title, event.date, event.results, JSON.stringify(input.metadata || {})]
	);

	if (result) return mapHistoryRow(result.rows[0]);

	memoryState.history.unshift(event);
	return event;
}
