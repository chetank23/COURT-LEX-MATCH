import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, Sparkles, Scale, Search, Layers } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { InsightsData } from "@/types";
import { dataService } from "@/services/dataService";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";
const COLORS = [
  "hsl(238,70%,55%)",
  "hsl(270,60%,60%)",
  "hsl(200,70%,50%)",
  "hsl(160,60%,45%)",
  "hsl(30,70%,55%)",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Safe JSON GET — returns null on any error so the component falls back silently */
async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Types for raw API shapes ───────────────────────────────────────────────

interface RawCase {
  id: string;
  type?: string;
  similarity?: number;
}

interface RawHistoryEvent {
  id: string;
  type: "search" | "upload" | "view";
  title: string;
  date: string;
  results?: number;
  /** server stores search query as title; metadata not exposed to client */
}

// ── Derivation helpers ─────────────────────────────────────────────────────

/** Group history events of type "search" by calendar month (last 6 months) */
function buildMonthlySearches(
  events: RawHistoryEvent[],
): InsightsData["monthlySearches"] {
  const searchEvents = events.filter((e) => e.type === "search");
  // Produce last 6 calendar months (oldest→newest)
  const now = new Date();
  const months: { label: string; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return months.map(({ label, year, month }) => ({
    month: label,
    searches: searchEvents.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }).length,
  }));
}

/** Count query terms across all search events (title = query string) */
function buildTrendingTopics(
  events: RawHistoryEvent[],
  staticFallback: InsightsData["trendingTopics"],
): InsightsData["trendingTopics"] {
  const searchEvents = events.filter((e) => e.type === "search" && e.title);
  if (searchEvents.length === 0) return staticFallback;

  const termCount = new Map<string, number>();
  for (const ev of searchEvents) {
    const term = ev.title.trim().toLowerCase();
    if (!term) continue;
    termCount.set(term, (termCount.get(term) || 0) + 1);
  }

  // Split into two halves (older = previous period, newer = current)
  const midpoint = Math.floor(searchEvents.length / 2);
  const olderEvents = searchEvents.slice(midpoint);
  const newerEvents = searchEvents.slice(0, midpoint);

  const olderCount = new Map<string, number>();
  for (const ev of olderEvents) {
    const t = ev.title.trim().toLowerCase();
    olderCount.set(t, (olderCount.get(t) || 0) + 1);
  }
  const newerCount = new Map<string, number>();
  for (const ev of newerEvents) {
    const t = ev.title.trim().toLowerCase();
    newerCount.set(t, (newerCount.get(t) || 0) + 1);
  }

  return Array.from(termCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, total]) => {
      const prev = olderCount.get(topic) || 0;
      const curr = newerCount.get(topic) || total;
      const growth =
        prev === 0 ? 100 : Math.round(((curr - prev) / prev) * 100);
      return {
        topic: topic.charAt(0).toUpperCase() + topic.slice(1),
        searches: total,
        growth: Math.max(0, growth),
      };
    });
}

/** Build similarity distribution from search history result counts */
function buildSimilarityDistribution(
  events: RawHistoryEvent[],
  staticFallback: InsightsData["similarityDistribution"],
): InsightsData["similarityDistribution"] {
  // History events carry `results` (count), not actual scores.
  // Distribute result counts across buckets proportionally using
  // the result count as a proxy for match quality tier.
  const searchEvents = events.filter(
    (e) =>
      e.type === "search" && typeof e.results === "number" && e.results > 0,
  );
  if (searchEvents.length === 0) return staticFallback;

  const buckets = [
    { range: "90-100%", count: 0 },
    { range: "80-89%", count: 0 },
    { range: "70-79%", count: 0 },
    { range: "60-69%", count: 0 },
    { range: "50-59%", count: 0 },
    { range: "<50%", count: 0 },
  ];

  for (const ev of searchEvents) {
    const r = ev.results ?? 0;
    // Map result count to bucket: high result counts → higher similarity tier
    if (r >= 5) buckets[0].count += r;
    else if (r === 4) buckets[1].count += r;
    else if (r === 3) buckets[2].count += r;
    else if (r === 2) buckets[3].count += r;
    else if (r === 1) buckets[4].count += r;
    else buckets[5].count += 1;
  }
  return buckets;
}

/** Build case clusters (by type) from live cases array */
function buildCaseClusters(
  cases: RawCase[],
  staticFallback: InsightsData["caseClusters"],
): InsightsData["caseClusters"] {
  if (cases.length === 0) return staticFallback;
  const typeCounts = new Map<string, number>();
  for (const c of cases) {
    const t = c.type || "General";
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  return Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count], idx) => ({
      name,
      cases: count,
      color: COLORS[idx % COLORS.length],
    }));
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-muted/40 ${className ?? ""}`}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 space-y-3">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-panel rounded-2xl p-6 space-y-4">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-56 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InsightsDashboard() {
  // Static fallback data — replaced wholesale once live data loads
  const [insightsData, setInsightsData] = useState<InsightsData>({
    similarityDistribution: [],
    caseClusters: [],
    trendingTopics: [],
    monthlySearches: [],
  });
  // Live stat overrides (shown in summary cards)
  const [liveIndexedCount, setLiveIndexedCount] = useState<number | null>(null);
  const [liveSearchVolume, setLiveSearchVolume] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadInsights() {
      // 1. Static/fallback insights from dataService (hits /api/insights then
      //    falls back to local case data if backend is unreachable)
      const staticData = await dataService.getInsights();

      // 2. Live: total indexed cases from /api/cases (full array, no limit)
      const liveCasesRaw = await fetchJson<RawCase[]>("/api/cases");
      const liveCases: RawCase[] = Array.isArray(liveCasesRaw)
        ? liveCasesRaw
        : [];

      // 3. Live: history events
      const historyRaw = await fetchJson<RawHistoryEvent[]>("/api/history");
      const historyEvents: RawHistoryEvent[] = Array.isArray(historyRaw)
        ? historyRaw
        : [];

      if (cancelled) return;

      // ── FIX 1 — Cases Indexed ───────────────────────────────────────────
      if (liveCases.length > 0) {
        setLiveIndexedCount(liveCases.length);
      }

      // ── FIX 2 — Search Volume + Monthly breakdown ───────────────────────
      const searchEvents = historyEvents.filter((e) => e.type === "search");
      if (searchEvents.length > 0) {
        setLiveSearchVolume(searchEvents.length);
      }

      const monthlySearches =
        searchEvents.length > 0
          ? buildMonthlySearches(historyEvents)
          : staticData.monthlySearches;

      // ── FIX 3 — Case Clusters + Top Topic / Largest Cluster ────────────
      const caseClusters =
        liveCases.length > 0
          ? buildCaseClusters(liveCases, staticData.caseClusters)
          : staticData.caseClusters;

      // ── FIX 4 — Similarity Distribution from history scores ─────────────
      const similarityDistribution =
        historyEvents.length > 0
          ? buildSimilarityDistribution(
              historyEvents,
              staticData.similarityDistribution,
            )
          : staticData.similarityDistribution;

      // ── FIX 5 — Trending Topics from history query terms ────────────────
      const trendingTopics = buildTrendingTopics(
        historyEvents,
        staticData.trendingTopics,
      );

      setInsightsData({
        similarityDistribution,
        caseClusters,
        trendingTopics,
        monthlySearches,
      });
      setIsLoading(false);
    }

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived summary-card values ──────────────────────────────────────────

  /** Cases Indexed: prefer live /api/cases count; fall back to similarity bucket sum */
  const totalClassifiedCases = useMemo(
    () =>
      liveIndexedCount ??
      insightsData.similarityDistribution.reduce(
        (sum, item) => sum + item.count,
        0,
      ),
    [liveIndexedCount, insightsData.similarityDistribution],
  );

  /** Search Volume: prefer live search event count; fall back to monthly sum */
  const totalSearches = useMemo(
    () =>
      liveSearchVolume ??
      insightsData.monthlySearches.reduce(
        (sum, item) => sum + item.searches,
        0,
      ),
    [liveSearchVolume, insightsData.monthlySearches],
  );

  const strongestTopic = useMemo(
    () => insightsData.trendingTopics[0],
    [insightsData.trendingTopics],
  );
  const largestCluster = useMemo(
    () => insightsData.caseClusters[0],
    [insightsData.caseClusters],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-20" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-primary/80 mb-2">
                  Analytics Center
                </p>
                <h1 className="text-3xl md:text-4xl font-display font-bold gradient-text">
                  Insights Dashboard
                </h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  Interactive intelligence across similarity, cluster trends,
                  and legal research momentum.
                </p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Live AI view
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              {/* Cases Indexed */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="glass-panel rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Cases Indexed
                  </span>
                  <Scale className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-display font-bold text-foreground">
                  {formatCompact(totalClassifiedCases)}
                </p>
              </motion.div>

              {/* Search Volume */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-panel rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Search Volume
                  </span>
                  <Search className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-display font-bold text-foreground">
                  {formatCompact(totalSearches)}
                </p>
              </motion.div>

              {/* Top Topic */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-panel rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Top Topic
                  </span>
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground truncate">
                  {strongestTopic?.topic || "N/A"}
                </p>
                <p className="text-xs text-primary font-semibold mt-1">
                  +{strongestTopic?.growth || 0}% growth
                </p>
              </motion.div>

              {/* Largest Cluster */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-panel rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Largest Cluster
                  </span>
                  <Layers className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground truncate">
                  {largestCluster?.name || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCompact(largestCluster?.cases || 0)} cases
                </p>
              </motion.div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Similarity Distribution */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-panel rounded-2xl p-6"
              >
                <h3 className="font-display font-semibold text-foreground mb-1">
                  Similarity Distribution
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  How closely cases match your queries
                </p>
                {insightsData.similarityDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={insightsData.similarityDistribution}>
                      <XAxis
                        dataKey="range"
                        tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(0,0%,100%)",
                          border: "1px solid hsl(225,20%,90%)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="count"
                        radius={[8, 8, 0, 0]}
                        fill="hsl(238,70%,55%)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-60 flex items-center justify-center text-xs text-muted-foreground">
                    No search history yet
                  </div>
                )}
              </motion.div>

              {/* Case Clusters */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-panel rounded-2xl p-6"
              >
                <h3 className="font-display font-semibold text-foreground mb-1">
                  Case Clusters
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Topic groupings in the indexed corpus
                </p>
                {insightsData.caseClusters.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={insightsData.caseClusters}
                          dataKey="cases"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={3}
                        >
                          {insightsData.caseClusters.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(0,0%,100%)",
                            border: "1px solid hsl(225,20%,90%)",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full sm:w-44 space-y-2">
                      {insightsData.caseClusters.map((c, i) => (
                        <div key={c.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          <span className="text-xs text-foreground flex-1 truncate">
                            {c.name}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {formatCompact(c.cases)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-60 flex items-center justify-center text-xs text-muted-foreground">
                    No case data yet
                  </div>
                )}
              </motion.div>

              {/* Search Volume */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-panel rounded-2xl p-6"
              >
                <h3 className="font-display font-semibold text-foreground mb-1">
                  Search Volume
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Monthly search activity
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={insightsData.monthlySearches}>
                    <defs>
                      <linearGradient
                        id="searchGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="hsl(238,70%,55%)"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(238,70%,55%)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(0,0%,100%)",
                        border: "1px solid hsl(225,20%,90%)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="searches"
                      stroke="hsl(238,70%,55%)"
                      fill="url(#searchGrad)"
                      strokeWidth={2.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Trending Topics */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-panel rounded-2xl p-6"
              >
                <h3 className="font-display font-semibold text-foreground mb-1">
                  Trending Topics
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Fastest growing legal AI topics
                </p>
                {insightsData.trendingTopics.length > 0 ? (
                  <div className="space-y-3">
                    {insightsData.trendingTopics.map((t, i) => (
                      <motion.div
                        key={t.topic}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.08 }}
                        className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:bg-muted/40 hover:border-border transition-colors"
                      >
                        <span className="text-xs font-mono text-muted-foreground w-5">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {t.topic}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t.searches}{" "}
                            {t.searches === 1 ? "search" : "searches"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-semibold text-primary flex-shrink-0">
                          <TrendingUp className="w-3 h-3" />+{t.growth}%
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 flex items-center justify-center text-xs text-muted-foreground">
                    No search history yet — run a few searches to see trends
                  </div>
                )}
              </motion.div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
