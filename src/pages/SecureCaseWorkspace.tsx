import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { UploadCloud, BriefcaseBusiness, Gavel, LogOut, ClipboardCheck } from "lucide-react";
import { useAuth, type ManagedCase } from "@/contexts/AuthContext";
import { useSearch } from "@/contexts/SearchContext";

type ManagedStatus = ManagedCase["status"];

const STATUS_LIST: ManagedStatus[] = ["New", "Under Review", "Assigned", "Hearing Scheduled"];
const JUDGES = ["Justice N. Rao", "Justice R. Iyer", "Justice P. Mehta", "Justice K. Banerjee"];

export default function SecureCaseWorkspace() {
  const { user, logout, managedCases, upsertManagedCase, updateManagedCase } = useAuth();
  const { state } = useSearch();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftJudge, setDraftJudge] = useState(JUDGES[0]);
  const [draftNotes, setDraftNotes] = useState("");

  const candidateCases = useMemo(() => state.matchedCases.slice(0, 8), [state.matchedCases]);

  const roleTitle = user?.role === "judge" ? "Judge View" : "Support Staff Console";

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <div className="glass-panel rounded-2xl p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Authenticated Page</p>
              <h1 className="text-3xl font-display font-bold text-foreground mt-2">{roleTitle}</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Logged in as <span className="font-semibold text-foreground">{user?.name}</span> ({user?.role})
              </p>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive/10 text-destructive px-4 py-2 text-sm font-semibold hover:bg-destructive/20 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 glass-panel rounded-2xl p-5">
            <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              <BriefcaseBusiness className="w-5 h-5 text-primary" /> Managed Case Queue
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Role-based case workflow with assignment and status updates.</p>

            <div className="mt-4 space-y-3">
              {managedCases.map((caseItem) => (
                <motion.div key={caseItem.id} layout className="rounded-xl border border-border/80 bg-card/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{caseItem.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Uploaded by {caseItem.uploadedBy} | Last update {new Date(caseItem.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] bg-primary/10 text-primary font-semibold">{caseItem.status}</span>
                  </div>

                  <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Assigned Judge</p>
                      <p className="text-foreground mt-1">{caseItem.assignedJudge}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notes</p>
                      <p className="text-foreground mt-1 line-clamp-2">{caseItem.notes || "No notes"}</p>
                    </div>
                  </div>

                  {user?.role === "staff" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <select
                        value={caseItem.status}
                        onChange={(event) => updateManagedCase(caseItem.id, { status: event.target.value as ManagedStatus })}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        {STATUS_LIST.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                      <select
                        value={caseItem.assignedJudge}
                        onChange={(event) => updateManagedCase(caseItem.id, { assignedJudge: event.target.value })}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        {JUDGES.map((judge) => (
                          <option key={judge} value={judge}>{judge}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 px-3 py-2 text-xs font-semibold inline-flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" /> Judge access is read-only for integrity.
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          <div className="xl:col-span-2 space-y-6">
            <div className="glass-panel rounded-2xl p-5">
              <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                <Gavel className="w-5 h-5 text-primary" /> Suggested From AI Matches
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Uses current matched cases from AI Search/PDF workflow.</p>

              <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
                {candidateCases.length ? (
                  candidateCases.map((item) => (
                    <div key={item.id} className="rounded-lg bg-muted/35 p-3">
                      <p className="text-sm font-semibold text-foreground line-clamp-2">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{item.court} | {item.year}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No AI matched cases yet. Run AI Search Lab or PDF Analyzer first.</p>
                )}
              </div>
            </div>

            {user?.role === "staff" ? (
              <div className="glass-panel rounded-2xl p-5">
                <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-primary" /> Staff Upload And Case Intake
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Upload evidence or intake docs and add to managed queue.</p>

                <div className="mt-4 space-y-3">
                  <input
                    type="file"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0];
                      if (nextFile) setSelectedFileName(nextFile.name);
                    }}
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Case title"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <select
                    value={draftJudge}
                    onChange={(event) => setDraftJudge(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {JUDGES.map((judge) => (
                      <option key={judge} value={judge}>{judge}</option>
                    ))}
                  </select>
                  <textarea
                    value={draftNotes}
                    onChange={(event) => setDraftNotes(event.target.value)}
                    placeholder="Case notes"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-24"
                  />
                  <button
                    onClick={() => {
                      if (!draftTitle.trim()) return;
                      upsertManagedCase({
                        id: `case-${Date.now()}`,
                        title: draftTitle.trim(),
                        status: "New",
                        assignedJudge: draftJudge,
                        uploadedBy: user?.name || "Court Support Officer",
                        uploadName: selectedFileName,
                        notes: draftNotes.trim(),
                      });
                      setDraftTitle("");
                      setDraftNotes("");
                      setSelectedFileName("");
                    }}
                    className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Add Case To Managed Queue
                  </button>
                </div>
                {selectedFileName ? <p className="text-xs text-muted-foreground mt-2">Selected upload: {selectedFileName}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
