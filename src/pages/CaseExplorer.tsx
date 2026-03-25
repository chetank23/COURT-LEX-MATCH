import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid3X3, GitBranch, Filter, X, ChevronRight, Scale, Calendar, Tag } from "lucide-react";
import { CaseResult } from "@/types";
import { dataService } from "@/services/dataService";

function CaseCard({ c, onClick }: { c: CaseResult; onClick: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, scale: 1.02 }}
      onClick={onClick}
      className="glass-panel rounded-2xl p-5 cursor-pointer group hover:glow-primary transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">{c.type}</span>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-destructive/10 text-destructive">
            {c.priorityBand || "P3"} · {c.priorityScore || 0}
          </span>
        </div>
        <span className="text-2xl font-display font-bold gradient-text">{c.similarity}%</span>
      </div>
      <h3 className="font-display font-semibold text-foreground text-sm leading-tight mb-2 group-hover:text-primary transition-colors">
        {c.title}
      </h3>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{c.summary}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Scale className="w-3 h-3" /> {c.court}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" /> {c.year}
        </div>
      </div>
      <div className="flex gap-1 mt-3 flex-wrap">
        {c.tags.map((t) => (
          <span key={t} className="px-2 py-0.5 rounded text-[9px] font-medium bg-accent/10 text-accent">{t}</span>
        ))}
      </div>
    </motion.div>
  );
}

function GraphView({ cases, onSelect }: { cases: CaseResult[]; onSelect: (c: CaseResult) => void }) {
  const nodes = useMemo(() => {
    return cases.map((c, i) => {
      const angle = (i / cases.length) * Math.PI * 2;
      const radius = 160 + Math.random() * 60;
      return {
        ...c,
        x: 300 + Math.cos(angle) * radius,
        y: 250 + Math.sin(angle) * radius,
        r: 20 + c.similarity / 5,
      };
    });
  }, [cases]);

  return (
    <div className="w-full h-[500px] relative glass-panel rounded-2xl overflow-hidden">
      <svg width="100%" height="100%" viewBox="0 0 600 500">
        {/* Edges */}
        {nodes.map((n1, i) =>
          nodes.slice(i + 1).map((n2) => {
            const sim = Math.min(n1.similarity, n2.similarity);
            if (sim < 70) return null;
            return (
              <line
                key={`${n1.id}-${n2.id}`}
                x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y}
                stroke="hsl(238 70% 55%)"
                strokeOpacity={sim / 200}
                strokeWidth={1}
              />
            );
          })
        )}
        {/* Center node */}
        <circle cx={300} cy={250} r={30} fill="hsl(238 70% 55%)" fillOpacity={0.15} />
        <circle cx={300} cy={250} r={8} fill="hsl(238 70% 55%)" />
        <text x={300} y={290} textAnchor="middle" fontSize="10" fill="hsl(238 70% 55%)" fontWeight="600">Your Query</text>
        {/* Case nodes */}
        {nodes.map((n) => (
          <g key={n.id} onClick={() => onSelect(n)} className="cursor-pointer">
            <circle
              cx={n.x} cy={n.y} r={n.r}
              fill="hsl(238 70% 55%)"
              fillOpacity={n.similarity / 150}
              stroke="hsl(238 70% 55%)"
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
            <text x={n.x} y={n.y - n.r - 6} textAnchor="middle" fontSize="9" fill="hsl(225 10% 50%)" className="pointer-events-none">
              {n.title.length > 20 ? n.title.slice(0, 20) + "…" : n.title}
            </text>
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fill="hsl(0 0% 100%)" fontWeight="700" className="pointer-events-none">
              {n.similarity}%
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DetailPanel({ c, onClose }: { c: CaseResult; onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 25 }}
      className="fixed right-0 top-0 bottom-0 w-full max-w-md z-40 bg-card border-l border-border shadow-2xl p-6 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">{c.type}</span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
            Priority {c.priorityBand || "P3"} ({c.priorityScore || 0})
          </span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80">
          <X className="w-4 h-4" />
        </button>
      </div>
      <h2 className="text-xl font-display font-bold text-foreground mb-2">{c.title}</h2>
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
        <span>{c.court}</span>
        <span>·</span>
        <span>{c.year}</span>
      </div>
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Similarity Score</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${c.similarity}%` }}
              transition={{ duration: 1 }}
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, hsl(238 70% 55%), hsl(270 60% 60%))" }}
            />
          </div>
          <span className="text-lg font-display font-bold gradient-text">{c.similarity}%</span>
        </div>
      </div>
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI Summary</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{c.summary}</p>
      </div>
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Why This Matches</p>
        <div className="p-4 rounded-xl gradient-surface border border-primary/10">
          <p className="text-sm text-foreground/80 leading-relaxed">{c.whyMatch}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
        <div className="flex gap-2 flex-wrap">
          {c.tags.map((t) => (
            <span key={t} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent">{t}</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function CaseExplorer() {
  const [view, setView] = useState<"grid" | "graph">("grid");
  const [courtFilter, setCourtFilter] = useState("All Courts");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [selected, setSelected] = useState<CaseResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const courts = useMemo(
    () => ["All Courts", ...Array.from(new Set(cases.map((c) => c.court))).sort()],
    [cases]
  );
  const types = useMemo(
    () => ["All Types", ...Array.from(new Set(cases.map((c) => c.type))).sort()],
    [cases]
  );

  useEffect(() => {
    const loadCases = async () => {
      const loadedCases = await dataService.getCases();
      setCases(loadedCases);
      setIsLoading(false);
    };
    loadCases();
  }, []);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (courtFilter !== "All Courts" && c.court !== courtFilter) return false;
      if (typeFilter !== "All Types" && c.type !== typeFilter) return false;
      return true;
    });
  }, [cases, courtFilter, typeFilter]);

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">Case Explorer</h1>
            <p className="text-sm text-muted-foreground mt-1">Browse and visualize the legal dataset</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                showFilters ? "bg-primary text-primary-foreground" : "glass-panel text-foreground"
              }`}
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
            <div className="glass-panel rounded-xl p-1 flex">
              <button
                onClick={() => setView("grid")}
                className={`px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("graph")}
                className={`px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${view === "graph" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <GitBranch className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="glass-panel rounded-2xl p-5 flex flex-wrap gap-6">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Court</p>
                  <div className="flex flex-wrap gap-1.5">
                    {courts.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCourtFilter(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          courtFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Case Type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {types.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading cases...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No cases found matching your filters.</p>
          </div>
        ) : view === "grid" ? (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filtered.map((c) => (
                <CaseCard key={c.id} c={c} onClick={() => setSelected(c)} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <GraphView cases={filtered} onSelect={setSelected} />
        )}

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No cases match the current filters</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && <DetailPanel c={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
