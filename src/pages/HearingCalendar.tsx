import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, X, Edit2, Trash2, Clock, Users, MapPin } from "lucide-react";
import { HearingSchedule, JudgeProfile } from "@/types";
import { useSearch } from "@/contexts/SearchContext";

type DialogMode = "add" | "edit" | null;

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const initialHearings: HearingSchedule[] = [
  {
    id: "hearing-1",
    caseId: "case-101",
    caseTitle: "State vs. Ram Kumar",
    assignedJudgeId: "judge-1",
    assignedJudgeName: "Justice N. Rao",
    hearingDate: "2025-01-28",
    hearingTime: "10:00 AM",
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
    hearingTime: "02:00 PM",
    courtRoom: "Court Room 3",
    state: "Maharashtra",
    district: "Mumbai",
    localCourtName: "Bombay High Court",
    status: "Scheduled",
    notes: "Arguments on admissibility",
  },
  {
    id: "hearing-3",
    caseId: "case-303",
    caseTitle: "Property Dispute - Patel Family",
    assignedJudgeId: "judge-3",
    assignedJudgeName: "Justice R. Iyer",
    hearingDate: "2025-02-15",
    hearingTime: "11:00 AM",
    courtRoom: "Court Room 2",
    state: "Karnataka",
    district: "Bangalore",
    localCourtName: "Karnataka High Court",
    status: "Scheduled",
    notes: "Document verification",
  },
];

const mockJudges: JudgeProfile[] = [
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
];

function parseHearingDate(value: string) {
  const trimmed = `${value || ""}`.trim();
  if (!trimmed) return null;

  const dmyMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return new Date(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, Number.parseInt(day, 10));
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1, Number.parseInt(day, 10));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatHearingDate(value: string) {
  const parsed = parseHearingDate(value);
  if (!parsed) return value;
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const year = `${parsed.getFullYear()}`;
  return `${day}-${month}-${year}`;
}

function formatDateForInput(value: string) {
  const parsed = parseHearingDate(value);
  if (!parsed) return "";
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const year = `${parsed.getFullYear()}`;
  return `${year}-${month}-${day}`;
}

function normalizeHearingTime(value: string) {
  const raw = `${value || ""}`.trim();
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampmMatch) {
    let hours = Number.parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return `${`${hours}`.padStart(2, "0")}:${minutes}`;
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number.parseInt(twentyFourHourMatch[1], 10);
    return `${`${hours}`.padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }

  return "10:00";
}

function HearingCard({ hearing, onEdit, onDelete }: { hearing: HearingSchedule; onEdit: (h: HearingSchedule) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const date = parseHearingDate(hearing.hearingDate);
  const dateStr = date ? date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : hearing.hearingDate;

  const statusColors = {
    Scheduled: "bg-blue-500/15 text-blue-700",
    Ongoing: "bg-yellow-500/15 text-yellow-700",
    Completed: "bg-green-500/15 text-green-700",
    Postponed: "bg-red-500/15 text-red-700",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-panel rounded-2xl p-5 hover:glow-primary transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-display font-semibold text-foreground">{hearing.caseTitle}</h3>
          <p className="text-xs text-muted-foreground mt-2">
            {dateStr} · {hearing.hearingTime}
          </p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${statusColors[hearing.status]}`}>
              {hearing.status}
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-700">
              {hearing.assignedJudgeName.split(" ")[1]}
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{hearing.hearingTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <div className="text-sm text-foreground">
                    <p>{hearing.courtRoom}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{hearing.localCourtName}</p>
                    <p className="text-xs text-muted-foreground">{hearing.district}, {hearing.state}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{hearing.assignedJudgeName}</span>
                </div>
              </div>

              {hearing.notes && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
                  <p className="text-xs text-foreground mt-1">{hearing.notes}</p>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(hearing);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(hearing.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function HearingDialog({ hearing, mode, onClose, onSave }: { hearing: HearingSchedule | null; mode: DialogMode; onClose: () => void; onSave: (h: HearingSchedule) => void }) {
  const [formData, setFormData] = useState<HearingSchedule>(
    hearing || {
      id: `hearing-${Date.now()}`,
      caseId: "",
      caseTitle: "",
      assignedJudgeId: "",
      assignedJudgeName: "",
      hearingDate: "",
      hearingTime: "10:00",
      courtRoom: "",
      state: "",
      district: "",
      localCourtName: "",
      status: "Scheduled",
      notes: "",
    }
  );

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="glass-panel rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold text-foreground">
                {mode === "add" ? "Schedule Hearing" : "Edit Hearing"}
              </h2>
              <button onClick={onClose} className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Case Title</label>
                <input
                  value={formData.caseTitle}
                  onChange={(e) => setFormData({ ...formData, caseTitle: e.target.value })}
                  placeholder="e.g., State vs. Ram Kumar"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hearing Date</label>
                  <input
                    type="date"
                    value={formatDateForInput(formData.hearingDate)}
                    onChange={(e) => setFormData({ ...formData, hearingDate: e.target.value ? formatHearingDate(e.target.value) : "" })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hearing Time</label>
                  <input
                    type="time"
                    value={formData.hearingTime}
                    onChange={(e) => setFormData({ ...formData, hearingTime: normalizeHearingTime(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Judge</label>
                  <select
                    value={formData.assignedJudgeId}
                    onChange={(e) => {
                      const judge = mockJudges.find((j) => j.id === e.target.value);
                      if (judge) {
                        setFormData({ ...formData, assignedJudgeId: judge.id, assignedJudgeName: judge.name });
                      }
                    }}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  >
                    <option value="">Select Judge</option>
                    {mockJudges.map((judge) => (
                      <option key={judge.id} value={judge.id}>
                        {judge.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Court Room</label>
                  <input
                    value={formData.courtRoom}
                    onChange={(e) => setFormData({ ...formData, courtRoom: e.target.value })}
                    placeholder="e.g., Court Room 1"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">State</label>
                  <input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="e.g., Delhi"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">District</label>
                  <input
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    placeholder="e.g., New Delhi"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Local Court Name</label>
                  <input
                    value={formData.localCourtName}
                    onChange={(e) => setFormData({ ...formData, localCourtName: e.target.value })}
                    placeholder="e.g., Delhi High Court"
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as HearingSchedule["status"] })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                >
                  <option>Scheduled</option>
                  <option>Ongoing</option>
                  <option>Completed</option>
                  <option>Postponed</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional details about this hearing"
                  rows={3}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onSave(formData);
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function HearingCalendar() {
  const { state, addHearing, updateHearing, deleteHearing } = useSearch();
  
  // Use persisted hearings from context
  const hearings = state.hearings && state.hearings.length > 0 ? state.hearings : initialHearings;
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedHearing, setSelectedHearing] = useState<HearingSchedule | null>(null);

  const handleAdd = () => {
    setSelectedHearing(null);
    setDialogMode("add");
  };

  const handleEdit = (hearing: HearingSchedule) => {
    setSelectedHearing(hearing);
    setDialogMode("edit");
  };

  const handleDelete = (id: string) => {
    deleteHearing(id);
  };

  const handleSave = (hearing: HearingSchedule) => {
    if (dialogMode === "add") {
      addHearing(hearing);
    } else {
      updateHearing(hearing);
    }
  };

  const monthHearings = hearings.filter((h) => {
    const hDate = parseHearingDate(h.hearingDate);
    return hDate ? hDate.getMonth() === currentMonth.getMonth() && hDate.getFullYear() === currentMonth.getFullYear() : false;
  });

  const upcomingHearings = hearings
    .filter((h) => {
      const parsed = parseHearingDate(h.hearingDate);
      return parsed ? parsed >= new Date() : false;
    })
    .sort((a, b) => (parseHearingDate(a.hearingDate)?.getTime() || 0) - (parseHearingDate(b.hearingDate)?.getTime() || 0))
    .slice(0, 5);

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Hearing Calendar</h1>
            <p className="text-sm text-muted-foreground mt-1">Schedule and track case hearings</p>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Schedule Hearing
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-display font-bold text-foreground">
                  {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                    className="p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setCurrentMonth(new Date())}
                    className="px-3 py-2 rounded-lg hover:bg-muted transition-colors text-xs font-medium cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                    className="p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Month Hearings */}
              <div className="space-y-3">
                {monthHearings.length > 0 ? (
                  monthHearings
                    .sort((a, b) => (parseHearingDate(a.hearingDate)?.getTime() || 0) - (parseHearingDate(b.hearingDate)?.getTime() || 0))
                    .map((hearing) => <HearingCard key={hearing.id} hearing={hearing} onEdit={handleEdit} onDelete={handleDelete} />)
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">No hearings scheduled for this month</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Sidebar */}
          <div>
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="text-lg font-display font-bold text-foreground mb-4">Upcoming Hearings</h3>
              <div className="space-y-3">
                {upcomingHearings.length > 0 ? (
                  upcomingHearings.map((hearing) => {
                    const date = parseHearingDate(hearing.hearingDate);
                    const dateStr = date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : hearing.hearingDate;

                    return (
                      <motion.div
                        key={hearing.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-primary">{dateStr}</p>
                            <p className="text-sm font-medium text-foreground truncate mt-0.5">{hearing.caseTitle}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{hearing.hearingTime}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-[10px] font-semibold whitespace-nowrap ${
                            hearing.status === "Scheduled" ? "bg-blue-500/15 text-blue-700" :
                            hearing.status === "Ongoing" ? "bg-yellow-500/15 text-yellow-700" :
                            "bg-green-500/15 text-green-700"
                          }`}>
                            {hearing.status}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">No upcoming hearings</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="glass-panel rounded-2xl p-6 mt-4">
              <h3 className="text-sm font-display font-bold text-foreground mb-4">Statistics</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total Hearings</span>
                  <span className="text-sm font-bold text-foreground">{hearings.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Scheduled</span>
                  <span className="text-sm font-bold text-blue-600">{hearings.filter((h) => h.status === "Scheduled").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Completed</span>
                  <span className="text-sm font-bold text-green-600">{hearings.filter((h) => h.status === "Completed").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Postponed</span>
                  <span className="text-sm font-bold text-red-600">{hearings.filter((h) => h.status === "Postponed").length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <HearingDialog hearing={selectedHearing} mode={dialogMode} onClose={() => setDialogMode(null)} onSave={handleSave} />
    </div>
  );
}
