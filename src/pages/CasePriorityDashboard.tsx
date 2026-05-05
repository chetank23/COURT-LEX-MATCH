import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ShieldAlert,
  Shield,
  ShieldCheck,
  Flame,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Activity,
  Gavel,
  ArrowUpRight,
} from "lucide-react";
import { dataService } from "@/services/dataService";
import type { CaseResult } from "@/types";

// ─── Priority band config ──────────────────────────────────────────────────
const PRIORITY_BANDS = [
  {
    band: "P0",
    label: "Critical",
    color: "hsl(0,72%,51%)",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-500",
    badgeBg: "bg-red-500",
    icon: Flame,
    description: "Immediate action required · Life/safety at risk",
    threshold: 85,
  },
  {
    band: "P1",
    label: "High",
    color: "hsl(25,95%,53%)",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-500",
    badgeBg: "bg-orange-500",
    icon: ShieldAlert,
    description: "Urgent · Serious offence · Assign within 24 hrs",
    threshold: 70,
  },
  {
    band: "P2",
    label: "Medium",
    color: "hsl(45,93%,47%)",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-500",
    badgeBg: "bg-yellow-500",
    icon: Shield,
    description: "Standard processing · Assign within 72 hrs",
    threshold: 50,
  },
  {
    band: "P3",
    label: "Low",
    color: "hsl(142,71%,45%)",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-500",
    badgeBg: "bg-emerald-500",
    icon: ShieldCheck,
    description: "Routine · Civil / minor matters",
    threshold: 0,
  },
] as const;

// ─── Crime severity matrix ─────────────────────────────────────────────────
const SEVERITY_MATRIX = [
  {
    category: "Violent Crimes",
    color: "hsl(0,72%,51%)",
    crimes: [
      {
        name: "Murder / Culpable Homicide",
        band: "P0",
        score: 96,
        ipc: "302/304",
      },
      { name: "Rape / Sexual Assault", band: "P0", score: 95, ipc: "376" },
      { name: "Acid Attack", band: "P0", score: 94, ipc: "326A" },
      { name: "Attempt to Murder", band: "P0", score: 90, ipc: "307" },
      { name: "Kidnapping / Abduction", band: "P0", score: 88, ipc: "363/365" },
      { name: "Terrorism", band: "P0", score: 99, ipc: "UAPA" },
    ],
  },
  {
    category: "Serious Offences",
    color: "hsl(25,95%,53%)",
    crimes: [
      {
        name: "Grievous Hurt / Armed Assault",
        band: "P1",
        score: 78,
        ipc: "326",
      },
      { name: "Extortion / Dacoity", band: "P1", score: 76, ipc: "383/395" },
      { name: "Rioting with Weapons", band: "P1", score: 74, ipc: "148" },
      { name: "Major Financial Fraud", band: "P1", score: 72, ipc: "420/467" },
      { name: "Drug Trafficking", band: "P1", score: 75, ipc: "NDPS" },
    ],
  },
  {
    category: "Moderate Offences",
    color: "hsl(45,93%,47%)",
    crimes: [
      {
        name: "Cheating / Breach of Trust",
        band: "P2",
        score: 58,
        ipc: "406/420",
      },
      { name: "Domestic Violence", band: "P2", score: 62, ipc: "498A" },
      { name: "Threatening / Intimidation", band: "P2", score: 55, ipc: "506" },
      { name: "Theft / Burglary", band: "P2", score: 52, ipc: "379/457" },
      { name: "Property Damage", band: "P2", score: 50, ipc: "427" },
    ],
  },
  {
    category: "Civil / Minor Matters",
    color: "hsl(142,71%,45%)",
    crimes: [
      { name: "Contractual Disputes", band: "P3", score: 35, ipc: "Civil" },
      {
        name: "Property Boundary Disputes",
        band: "P3",
        score: 30,
        ipc: "Civil",
      },
      {
        name: "Family / Matrimonial Matters",
        band: "P3",
        score: 38,
        ipc: "Hindu MA",
      },
      {
        name: "Minor Traffic Violations",
        band: "P3",
        score: 22,
        ipc: "MV Act",
      },
    ],
  },
];

// ─── Helper ────────────────────────────────────────────────────────────────
function getBandConfig(band: string) {
  return PRIORITY_BANDS.find((b) => b.band === band) ?? PRIORITY_BANDS[3];
}

function getPriorityColor(score: number): string {
  if (score >= 85) return "hsl(0,72%,51%)";
  if (score >= 70) return "hsl(25,95%,53%)";
  if (score >= 50) return "hsl(45,93%,47%)";
  return "hsl(142,71%,45%)";
}

// ─── Sub-components ────────────────────────────────────────────────────────
function ScoreBar({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="text-xs font-bold" style={{ color }}>
          {value}/100
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function PriorityBandCard({
  config,
  count,
  isSelected,
  onClick,
}: {
  config: (typeof PRIORITY_BANDS)[number];
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = config.icon;
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
        isSelected
          ? `${config.bg} ${config.border} shadow-lg`
          : "border-border bg-card/60 hover:border-border/80"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.bg}`}
        >
          <Icon className={`w-5 h-5 ${config.text}`} />
        </div>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${config.badgeBg}`}
        >
          {config.band}
        </span>
      </div>
      <p className={`text-2xl font-display font-bold ${config.text}`}>
        {count}
      </p>
      <p className="text-sm font-semibold text-foreground mt-0.5">
        {config.label} Priority
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
        {config.description}
      </p>
    </motion.button>
  );
}

function SeverityMatrixRow({
  crime,
}: {
  crime: { name: string; band: string; score: number; ipc: string };
}) {
  const bandConfig = getBandConfig(crime.band);
  const Icon = bandConfig.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors"
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${bandConfig.text}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {crime.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          IPC / Act: {crime.ipc}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${crime.score}%`,
              background: getPriorityColor(crime.score),
            }}
          />
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${bandConfig.bg} ${bandConfig.text}`}
        >
          {crime.band}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function CasePriorityDashboard() {
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseResult | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    "Violent Crimes",
  );

  useEffect(() => {
    dataService.getCases().then((data) => {
      setCases(data);
      setIsLoading(false);
    });
  }, []);

  const bandCounts = useMemo(() => {
    const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const c of cases) {
      const band = c.priorityBand ?? "P3";
      counts[band] = (counts[band] ?? 0) + 1;
    }
    return counts;
  }, [cases]);

  const filteredCases = useMemo(() => {
    const list = selectedBand
      ? cases.filter((c) => (c.priorityBand ?? "P3") === selectedBand)
      : cases;
    return [...list].sort(
      (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
    );
  }, [cases, selectedBand]);

  const totalCases = cases.length;
  const p0Pct = totalCases ? Math.round((bandCounts.P0 / totalCases) * 100) : 0;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-16 px-4 max-w-7xl mx-auto">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl p-6 md:p-8 mb-8"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <SlidersHorizontal className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500">
                Priority System
              </p>
              <h1 className="text-3xl font-display font-bold text-foreground">
                Case Priority Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Crime severity–based priority assignment for efficient judicial
                resource allocation
              </p>
            </div>
          </div>

          {/* Mini stat strip */}
          <div className="mt-5 flex flex-wrap gap-4">
            {[
              { label: "Total Cases", value: totalCases, icon: Activity },
              { label: "Critical (P0)", value: bandCounts.P0, icon: Flame },
              { label: "High (P1)", value: bandCounts.P1, icon: ShieldAlert },
              { label: "Critical Share", value: `${p0Pct}%`, icon: TrendingUp },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/40"
              >
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{label}:</span>
                <span className="text-sm font-bold text-foreground">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Priority Band Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {PRIORITY_BANDS.map((config, i) => (
            <motion.div
              key={config.band}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <PriorityBandCard
                config={config}
                count={bandCounts[config.band] ?? 0}
                isSelected={selectedBand === config.band}
                onClick={() =>
                  setSelectedBand((prev) =>
                    prev === config.band ? null : config.band,
                  )
                }
              />
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-8">
          {/* ── Crime Severity Matrix ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="xl:col-span-2 glass-panel rounded-2xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-display font-bold text-foreground">
                Crime Severity Matrix
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Priority bands assigned by crime type and severity level
            </p>
            <div className="space-y-2">
              {SEVERITY_MATRIX.map((cat) => (
                <div key={cat.category}>
                  <button
                    onClick={() =>
                      setExpandedCategory((p) =>
                        p === cat.category ? null : cat.category,
                      )
                    }
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: cat.color }}
                      />
                      <span className="text-sm font-semibold text-foreground">
                        {cat.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ({cat.crimes.length})
                      </span>
                    </div>
                    {expandedCategory === cat.category ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedCategory === cat.category && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden pl-2"
                      >
                        {cat.crimes.map((crime, idx) => (
                          <motion.div
                            key={crime.name}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                          >
                            <SeverityMatrixRow crime={crime} />
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Case Queue ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="xl:col-span-3 glass-panel rounded-2xl p-6 flex flex-col"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Gavel className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-display font-bold text-foreground">
                  {selectedBand
                    ? `${selectedBand} Case Queue`
                    : "All Cases by Priority"}
                </h2>
              </div>
              {selectedBand && (
                <button
                  onClick={() => setSelectedBand(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg bg-muted"
                >
                  Clear filter
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Loading cases...
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredCases.slice(0, 50).map((c, idx) => {
                  const band = c.priorityBand ?? "P3";
                  const bc = getBandConfig(band);
                  const Icon = bc.icon;
                  const isSelected = selectedCase?.id === c.id;
                  return (
                    <motion.button
                      key={c.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.015 }}
                      onClick={() => setSelectedCase(isSelected ? null : c)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? `${bc.bg} ${bc.border} border-2`
                          : "border-border bg-card/50 hover:border-border/70"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bc.bg}`}
                        >
                          <Icon className={`w-4 h-4 ${bc.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {c.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {c.type}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ·
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {c.court}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className={`text-sm font-bold ${bc.text}`}>
                              {c.priorityScore ?? 0}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              score
                            </p>
                          </div>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${bc.bg} ${bc.text}`}
                          >
                            {band}
                          </span>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 pt-3 border-t border-border space-y-2">
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {c.summary}
                              </p>
                              <ScoreBar
                                value={c.priorityScore ?? 0}
                                color={getPriorityColor(c.priorityScore ?? 0)}
                                label="Priority Score"
                              />
                              <ScoreBar
                                value={c.similarity}
                                color="hsl(238,70%,55%)"
                                label="Similarity"
                              />
                              <div className="flex flex-wrap gap-1 mt-2">
                                {c.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent font-medium"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                              <a
                                href="/assign-judges"
                                className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary hover:underline"
                              >
                                <Gavel className="w-3.5 h-3.5" /> Assign Judge
                                <ArrowUpRight className="w-3 h-3" />
                              </a>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
                {filteredCases.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No cases for this priority band
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── How Priority Scoring Works ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-panel rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-display font-bold text-foreground">
              How Priority Scoring Works
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Urgency",
                weight: "30%",
                color: "hsl(0,72%,51%)",
                desc: "Bail, stay, interim relief, habeas corpus signals",
              },
              {
                label: "Legal Impact",
                weight: "25%",
                color: "hsl(238,70%,55%)",
                desc: "Constitutional, public interest, policy implications",
              },
              {
                label: "Deadline Risk",
                weight: "20%",
                color: "hsl(25,95%,53%)",
                desc: "Limitation period, time-barred indicators",
              },
              {
                label: "Similarity & Compliance",
                weight: "25%",
                color: "hsl(142,71%,45%)",
                desc: "Citation strength, tax / regulatory penalty signals",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-muted/30 p-4 border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: item.color }}
                  >
                    {item.weight}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: item.weight,
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-primary">Priority Band Thresholds: </strong>
            Score ≥85 →{" "}
            <span className="text-red-500 font-semibold">P0 Critical</span> ·
            Score ≥70 →{" "}
            <span className="text-orange-500 font-semibold">P1 High</span> ·
            Score ≥50 →{" "}
            <span className="text-yellow-500 font-semibold">P2 Medium</span> ·
            Below 50 →{" "}
            <span className="text-emerald-500 font-semibold">P3 Low</span>. FIR
            severity further modulates scores using crime-type classification
            (Criminal → +42pts base, Specialized → +34pts, Civil → +26pts) plus
            bail risk and escape risk sub-scores.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
