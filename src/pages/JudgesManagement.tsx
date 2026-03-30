import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Users, Briefcase, Calendar, X } from "lucide-react";
import { JudgeProfile } from "@/types";
import { dataService } from "@/services/dataService";

type DialogMode = "add" | "edit" | null;

const initialJudges: JudgeProfile[] = [
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

function JudgeCard({ judge, onEdit, onDelete }: { judge: JudgeProfile; onEdit: (j: JudgeProfile) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const utilization = (judge.currentCaseLoad / judge.caseLoadCapacity) * 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-panel rounded-2xl p-5 hover:glow-primary transition-all"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between cursor-pointer hover:opacity-75"
      >
        <div className="flex-1 text-left">
          <h3 className="font-display font-semibold text-foreground">{judge.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">{judge.courtLevel} · {judge.category}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
          judge.availability === "Available" ? "bg-green-500/15 text-green-700" :
          judge.availability === "Busy" ? "bg-yellow-500/15 text-yellow-700" :
          "bg-red-500/15 text-red-700"
        }`}>
          {judge.availability}
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Experience</p>
                  <p className="text-sm text-foreground">{judge.yearsOfExperience} years</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Case Load</p>
                  <p className="text-sm text-foreground">{judge.currentCaseLoad}/{judge.caseLoadCapacity}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Utilization</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        width: `${utilization}%`,
                        background: utilization > 80 ? "hsl(0, 84%, 60%)" : utilization > 60 ? "hsl(38, 92%, 50%)" : "hsl(150, 66%, 70%)",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${utilization}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground min-w-[40px]">{Math.round(utilization)}%</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => onEdit(judge)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => onDelete(judge.id)}
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

function JudgeDialog({ judge, mode, onClose, onSave }: { judge: JudgeProfile | null; mode: DialogMode; onClose: () => void; onSave: (j: JudgeProfile) => void }) {
  const [formData, setFormData] = useState<JudgeProfile>(
    judge || {
      id: `judge-${Date.now()}`,
      name: "",
      courtLevel: "District Court",
      category: "Criminal",
      yearsOfExperience: 0,
      caseLoadCapacity: 50,
      currentCaseLoad: 0,
      availability: "Available",
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
            className="glass-panel rounded-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold text-foreground">
                {mode === "add" ? "Add Judge" : "Edit Judge"}
              </h2>
              <button onClick={onClose} className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Justice N. Rao"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Court Level</label>
                  <select
                    value={formData.courtLevel}
                    onChange={(e) => setFormData({ ...formData, courtLevel: e.target.value as JudgeProfile["courtLevel"] })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  >
                    <option>Supreme Court</option>
                    <option>High Court</option>
                    <option>District Court</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as JudgeProfile["category"] })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  >
                    <option>Criminal</option>
                    <option>Civil</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Experience (years)</label>
                  <input
                    type="number"
                    value={formData.yearsOfExperience}
                    onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
                  <select
                    value={formData.availability}
                    onChange={(e) => setFormData({ ...formData, availability: e.target.value as JudgeProfile["availability"] })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  >
                    <option>Available</option>
                    <option>Busy</option>
                    <option>On Leave</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Case Capacity</label>
                  <input
                    type="number"
                    value={formData.caseLoadCapacity}
                    onChange={(e) => setFormData({ ...formData, caseLoadCapacity: parseInt(e.target.value) || 50 })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Load</label>
                  <input
                    type="number"
                    value={formData.currentCaseLoad}
                    onChange={(e) => setFormData({ ...formData, currentCaseLoad: parseInt(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm outline-none"
                  />
                </div>
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

export default function JudgesManagement() {
  const [judges, setJudges] = useState<JudgeProfile[]>([]);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedJudge, setSelectedJudge] = useState<JudgeProfile | null>(null);

  useEffect(() => {
    const loadJudges = async () => {
      const loaded = await dataService.getJudges();
      setJudges(loaded.length > 0 ? loaded : initialJudges);
    };
    loadJudges();
  }, []);

  const handleAdd = () => {
    setSelectedJudge(null);
    setDialogMode("add");
  };

  const handleEdit = (judge: JudgeProfile) => {
    setSelectedJudge(judge);
    setDialogMode("edit");
  };

  const handleDelete = async (id: string) => {
    await dataService.removeJudge(id);
    setJudges((current) => current.filter((judge) => judge.id !== id));
  };

  const handleSave = async (judge: JudgeProfile) => {
    if (dialogMode === "add") {
      const created = await dataService.addJudge(judge);
      setJudges((current) => [...current, created]);
    } else {
      const updated = await dataService.editJudge(judge.id, judge);
      setJudges((current) => current.map((item) => (item.id === judge.id ? { ...item, ...updated } : item)));
    }
  };

  const availableJudges = judges.filter((j) => j.availability === "Available");
  const totalCapacity = judges.reduce((acc, j) => acc + j.caseLoadCapacity, 0);
  const totalCaseLoad = judges.reduce((acc, j) => acc + j.currentCaseLoad, 0);

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Judges Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Add and manage judges across courts</p>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Judge
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Judges</p>
                <p className="text-2xl font-display font-bold text-foreground">{judges.length}</p>
              </div>
              <Users className="w-8 h-8 text-primary opacity-20" />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Available</p>
                <p className="text-2xl font-display font-bold text-foreground">{availableJudges.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-green-500 opacity-20" />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">System Utilization</p>
                <p className="text-2xl font-display font-bold text-foreground">{Math.round((totalCaseLoad / totalCapacity) * 100)}%</p>
              </div>
              <Briefcase className="w-8 h-8 text-accent opacity-20" />
            </div>
          </motion.div>
        </div>

        {/* Judges Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {judges.map((judge) => (
              <JudgeCard key={judge.id} judge={judge} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </div>

        {judges.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No judges added yet. Click "Add Judge" to get started.</p>
          </div>
        )}
      </div>

      <JudgeDialog judge={selectedJudge} mode={dialogMode} onClose={() => setDialogMode(null)} onSave={handleSave} />
    </div>
  );
}
