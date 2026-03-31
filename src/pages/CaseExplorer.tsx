import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid3X3, GitBranch, Filter, X, Scale, Calendar, Users, ShieldCheck, UserRoundCheck, Search, MapPin, Sparkles } from "lucide-react";
import { CaseResult } from "@/types";
import { dataService } from "@/services/dataService";
import { useSearch } from "@/contexts/SearchContext";

type JudgeCategory = "Criminal" | "Civil" | "Other";

interface CaseAssignment {
  category: JudgeCategory;
  assignedJudge: string;
  availableJudges: string[];
  partyLabel: "Accused" | "Defendant";
  requiresPublicProsecutor: boolean;
}

type CourtLevel = "Supreme Court" | "High Court" | "District Court" | "Other Court";
type GroupByMode = "none" | "category" | "location" | "court-level";
type CaseTypeBucket = "Criminal" | "Civil" | "Specialized Cases";
const INITIAL_BATCH_SIZE = 24;
const LOAD_MORE_BATCH_SIZE = 24;
const MAX_GRAPH_NODES = 180;

const JUDGE_ROSTER: Record<JudgeCategory, string[]> = {
  Criminal: ["Justice N. Rao", "Justice P. Mehta", "Justice S. Khan"],
  Civil: ["Justice R. Iyer", "Justice K. Banerjee", "Justice V. Sen"],
  Other: ["Justice A. Menon", "Justice D. Kapoor", "Justice T. Joseph"],
};

function classifyJudgeCategory(caseType: string): JudgeCategory {
  const normalizedType = caseType.toLowerCase();

  if (
    normalizedType.includes("criminal") ||
    normalizedType.includes("ipc") ||
    normalizedType.includes("crime") ||
    normalizedType.includes("offence")
  ) {
    return "Criminal";
  }

  if (
    normalizedType.includes("civil") ||
    normalizedType.includes("property") ||
    normalizedType.includes("contract") ||
    normalizedType.includes("family")
  ) {
    return "Civil";
  }

  return "Other";
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getCaseAssignment(c: CaseResult): CaseAssignment {
  const category = classifyJudgeCategory(c.type);
  const availableJudges = JUDGE_ROSTER[category];
  const assignedJudge = availableJudges[hashText(`${c.id}:${c.title}`) % availableJudges.length];
  const requiresPublicProsecutor = category === "Criminal";

  return {
    category,
    assignedJudge,
    availableJudges,
    partyLabel: requiresPublicProsecutor ? "Accused" : "Defendant",
    requiresPublicProsecutor,
  };
}

function getCourtLevel(court: string): CourtLevel {
  const normalizedCourt = court.toLowerCase();
  if (normalizedCourt.includes("supreme")) return "Supreme Court";
  if (normalizedCourt.includes("high")) return "High Court";
  if (normalizedCourt.includes("district")) return "District Court";
  return "Other Court";
}

function getCaseTypeBucket(caseType: string): CaseTypeBucket {
  const normalizedType = caseType.toLowerCase();
  if (
    normalizedType.includes("criminal") ||
    normalizedType.includes("ipc") ||
    normalizedType.includes("crime") ||
    normalizedType.includes("offence")
  ) {
    return "Criminal";
  }

  if (
    normalizedType.includes("civil") ||
    normalizedType.includes("property") ||
    normalizedType.includes("contract") ||
    normalizedType.includes("family")
  ) {
    return "Civil";
  }

  return "Specialized Cases";
}

function getCourtLocation(court: string): string {
  const normalizedCourt = court.toLowerCase();
  const knownLocations = [
    "delhi",
    "mumbai",
    "bombay",
    "kolkata",
    "calcutta",
    "chennai",
    "madras",
    "bengaluru",
    "karnataka",
    "kerala",
    "gujarat",
    "allahabad",
    "punjab",
    "haryana",
    "patna",
    "orissa",
    "odisha",
    "rajasthan",
    "madhya pradesh",
    "uttarakhand",
    "telangana",
    "andhra pradesh",
    "jharkhand",
    "chhattisgarh",
    "himachal pradesh",
    "jammu",
  ];

  const matched = knownLocations.find((location) => normalizedCourt.includes(location));
  if (matched) return toTitleCase(matched);
  if (normalizedCourt.includes("supreme")) return "National";
  return "Unspecified";
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function CaseCard({ c, aiReason, onClick }: { c: CaseResult; aiReason?: string; onClick: () => void }) {
  const courtLevel = getCourtLevel(c.court);
  const location = getCourtLocation(c.court);

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
      <div className="rounded-lg border border-primary/10 bg-primary/5 p-2 mb-3">
        <p className="text-[11px] text-foreground/85 leading-relaxed line-clamp-3">
          <span className="font-semibold text-primary">AI Match Reason: </span>
          {aiReason || c.whyMatch}
        </p>
      </div>
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
        <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">{courtLevel}</span>
        <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">{location}</span>
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

function DetailPanel({ c, aiReason, onClose }: { c: CaseResult; aiReason?: string; onClose: () => void }) {
  const assignment = useMemo(() => getCaseAssignment(c), [c]);
  const courtLevel = useMemo(() => getCourtLevel(c.court), [c.court]);
  const location = useMemo(() => getCourtLocation(c.court), [c.court]);

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
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">{courtLevel}</span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">{location}</span>
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI Exact Match Reason</p>
        <div className="p-4 rounded-xl gradient-surface border border-primary/10">
          <p className="text-sm text-foreground/80 leading-relaxed">{aiReason || c.whyMatch}</p>
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

      <div className="mt-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Judge Assignment</p>
        <div className="p-4 rounded-xl gradient-surface border border-primary/10 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold">
              {assignment.category} Bench
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> {assignment.availableJudges.length} judges available
            </span>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assigned Judge</p>
            <p className="text-sm text-foreground flex items-center gap-2">
              <UserRoundCheck className="w-4 h-4 text-primary" />
              {assignment.assignedJudge}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Available Panel</p>
            <div className="flex flex-wrap gap-1.5">
              {assignment.availableJudges.map((judge) => (
                <span key={judge} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-muted text-foreground/80">
                  {judge}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5">
            <span className="text-xs text-foreground/90">{assignment.partyLabel} needs public prosecutor</span>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 ${
                assignment.requiresPublicProsecutor ? "bg-green-500/15 text-green-700" : "bg-muted text-muted-foreground"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {assignment.requiresPublicProsecutor ? "Required" : "Not Required"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function CaseExplorer() {
  const { state: searchState } = useSearch();
  const [view, setView] = useState<"grid" | "graph">("grid");
  const [groupBy, setGroupBy] = useState<GroupByMode>("none");
  const [courtFilter, setCourtFilter] = useState("All Courts");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<CaseResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [matchReasons, setMatchReasons] = useState<Record<string, string>>({});
  const [isReasoning, setIsReasoning] = useState(false);
  const [cases, setCases] = useState<CaseResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Determine if we should show matched cases or explore cases
  const showMatchedCases = searchState.hasUserData;
  const pageTitle = showMatchedCases ? "Case Explorer" : "Case Explorer";
  const pageSubtitle = showMatchedCases 
    ? "Browse by category, location, and court level with AI match explanations"
    : "Explore available cases in the database by category, location, and court level";

  const courts = useMemo(() => {
    const directCourts = Array.from(new Set(cases.map((c) => c.court)))
      .filter((court) => court.toLowerCase() !== "supreme court of india")
      .sort();
    return ["All Courts", "Supreme Court", "High Court", "District Court", ...directCourts];
  }, [cases]);
  const types = useMemo(
    () => ["All Types", "Criminal", "Civil", "Specialized Cases"],
    []
  );
  const locations = useMemo(
    () => ["All Locations", ...Array.from(new Set(cases.map((c) => getCourtLocation(c.court)))).sort()],
    [cases]
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    const timeout = setTimeout(async () => {
      let loadedCases: CaseResult[] = [];

      if (showMatchedCases) {
        // Load matched cases from search context
        if (searchState.matchedCases.length > 0) {
          loadedCases = searchState.matchedCases;
        }
      } else {
        // Load all cases for exploration
        const q = searchQuery.trim();
        loadedCases = q ? await dataService.searchCases(q) : await dataService.getCases();
      }

      if (!active) return;
      setCases(loadedCases);
      setIsLoading(false);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchQuery, showMatchedCases, searchState.matchedCases]);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (courtFilter !== "All Courts") {
        if (
          (courtFilter === "Supreme Court" || courtFilter === "High Court" || courtFilter === "District Court") &&
          getCourtLevel(c.court) !== courtFilter
        ) {
          return false;
        }

        if (
          courtFilter !== "Supreme Court" &&
          courtFilter !== "High Court" &&
          courtFilter !== "District Court" &&
          c.court !== courtFilter
        ) {
          return false;
        }
      }
      if (typeFilter !== "All Types" && getCaseTypeBucket(c.type) !== typeFilter) return false;
      if (locationFilter !== "All Locations" && getCourtLocation(c.court) !== locationFilter) return false;
      return true;
    });
  }, [cases, courtFilter, typeFilter, locationFilter]);

  const visibleCases = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const hasMoreCases = visibleCount < filtered.length;

  const grouped = useMemo(() => {
    const groupTitle = showMatchedCases ? "Matched Cases" : "Explore Cases";
    if (groupBy === "none") {
      return [{ title: groupTitle, key: "cases", items: visibleCases }];
    }

    const bucket = new Map<string, CaseResult[]>();
    visibleCases.forEach((item) => {
      let key = "Other";
      if (groupBy === "category") key = getCaseTypeBucket(item.type);
      if (groupBy === "location") key = getCourtLocation(item.court);
      if (groupBy === "court-level") key = getCourtLevel(item.court);
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)?.push(item);
    });

    return Array.from(bucket.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([title, items]) => ({ title, key: title, items }));
  }, [visibleCases, groupBy, showMatchedCases]);

  useEffect(() => {
    setVisibleCount(INITIAL_BATCH_SIZE);
  }, [searchQuery, courtFilter, typeFilter, locationFilter, groupBy, showMatchedCases]);

  useEffect(() => {
    if (view !== "grid") return;
    if (!hasMoreCases) return;

    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleCount((previous) => Math.min(previous + LOAD_MORE_BATCH_SIZE, filtered.length));
          }
        });
      },
      { rootMargin: "300px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [filtered.length, hasMoreCases, view]);

  useEffect(() => {
    let active = true;
    const generateReasons = async () => {
      if (visibleCases.length === 0) return;
      if (!showMatchedCases) return; // Skip reasoning for explore mode
      setIsReasoning(true);
      const reasons = await dataService.explainMatches(searchQuery || "legal case match", visibleCases);
      if (!active) return;
      setMatchReasons((previous) => ({ ...previous, ...reasons }));
      setIsReasoning(false);
    };
    generateReasons();

    return () => {
      active = false;
    };
  }, [visibleCases, searchQuery, showMatchedCases]);

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold gradient-text">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">{pageSubtitle}</p>
            {showMatchedCases && (
              <p className="text-xs text-accent mt-2">
                ✨ {searchState.aiSearchQuery ? `Showing matches for: "${searchState.aiSearchQuery}"` : "Showing PDF analysis results"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="glass-panel rounded-xl px-3 py-2.5 flex items-center gap-2 min-w-[260px]">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={showMatchedCases ? "Search matched cases..." : "Search cases..."}
                className="bg-transparent outline-none w-full text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
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
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Location
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {locations.map((location) => (
                      <button
                        key={location}
                        onClick={() => setLocationFilter(location)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          locationFilter === location ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {location}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">View By</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Default", value: "none" },
                      { label: "Category", value: "category" },
                      { label: "Location", value: "location" },
                      { label: "Court Level", value: "court-level" },
                    ].map((mode) => (
                      <button
                        key={mode.value}
                        onClick={() => setGroupBy(mode.value as GroupByMode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          groupBy === mode.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isReasoning && showMatchedCases && (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" /> AI is generating exact match reasons for visible cases...
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="mb-4 text-xs text-muted-foreground">
            {showMatchedCases 
              ? `Showing ${visibleCases.length} of ${filtered.length} matched cases`
              : `Showing ${visibleCases.length} of ${filtered.length} available cases`
            }
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">
              {showMatchedCases ? "Loading matched cases..." : "Loading cases..."}
            </p>
          </div>
        ) : showMatchedCases && cases.length === 0 ? (
          // No matched cases - show empty state for matched mode
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-2">No matched cases found</p>
            <p className="text-xs text-muted-foreground">Try searching again or go back to AI Search Lab</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No cases found matching your filters.</p>
          </div>
        ) : view === "grid" ? (
          <div className="space-y-7">
            {grouped.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-display font-semibold text-foreground">{group.title}</h2>
                  <span className="text-xs text-muted-foreground">{group.items.length} cases</span>
                </div>
                <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {group.items.map((c) => (
                      <CaseCard key={c.id} c={c} aiReason={matchReasons[c.id]} onClick={() => setSelected(c)} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </section>
            ))}

            {hasMoreCases && (
              <div className="flex flex-col items-center gap-3 pt-2">
                <div ref={loadMoreRef} className="h-2 w-full" aria-hidden="true" />
                <button
                  onClick={() => setVisibleCount((previous) => Math.min(previous + LOAD_MORE_BATCH_SIZE, filtered.length))}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
                >
                  Load more cases
                </button>
              </div>
            )}
          </div>
        ) : (
          <GraphView cases={filtered.slice(0, MAX_GRAPH_NODES)} onSelect={setSelected} />
        )}

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No cases match the current filters</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && <DetailPanel c={selected} aiReason={matchReasons[selected.id]} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
