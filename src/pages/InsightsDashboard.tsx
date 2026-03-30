import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Sparkles, Scale, Search, Layers } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { InsightsData } from "@/types";
import { dataService } from "@/services/dataService";

const COLORS = ["hsl(238,70%,55%)", "hsl(270,60%,60%)", "hsl(200,70%,50%)", "hsl(160,60%,45%)", "hsl(30,70%,55%)"];

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function InsightsDashboard() {
  const [insightsData, setInsightsData] = useState<InsightsData>({
    similarityDistribution: [],
    caseClusters: [],
    trendingTopics: [],
    monthlySearches: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadInsights = async () => {
      const data = await dataService.getInsights();
      setInsightsData(data);
      setIsLoading(false);
    };
    loadInsights();
  }, []);

  const totalClassifiedCases = useMemo(
    () => insightsData.similarityDistribution.reduce((sum, item) => sum + item.count, 0),
    [insightsData.similarityDistribution]
  );

  const totalSearches = useMemo(
    () => insightsData.monthlySearches.reduce((sum, item) => sum + item.searches, 0),
    [insightsData.monthlySearches]
  );

  const strongestTopic = useMemo(() => insightsData.trendingTopics[0], [insightsData.trendingTopics]);
  const largestCluster = useMemo(() => insightsData.caseClusters[0], [insightsData.caseClusters]);

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-20" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-primary/80 mb-2">Analytics Center</p>
                <h1 className="text-3xl md:text-4xl font-display font-bold gradient-text">Insights Dashboard</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">Interactive intelligence across similarity, cluster trends, and legal research momentum.</p>
              </div>
              <div className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Live AI view
              </div>
            </div>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading insights...</div>
        ) : insightsData.similarityDistribution.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No insights available yet</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Cases Indexed</span>
                  <Scale className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-display font-bold text-foreground">{formatCompact(totalClassifiedCases)}</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Search Volume</span>
                  <Search className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-display font-bold text-foreground">{formatCompact(totalSearches)}</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Top Topic</span>
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{strongestTopic?.topic || "N/A"}</p>
                <p className="text-xs text-primary font-semibold mt-1">+{strongestTopic?.growth || 0}% growth</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Largest Cluster</span>
                  <Layers className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{largestCluster?.name || "N/A"}</p>
                <p className="text-xs text-muted-foreground mt-1">{largestCluster?.cases || 0} cases</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Similarity Distribution */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-2xl p-6">
                <h3 className="font-display font-semibold text-foreground mb-1">Similarity Distribution</h3>
                <p className="text-xs text-muted-foreground mb-4">How closely cases match your queries</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={insightsData.similarityDistribution}>
                    <XAxis dataKey="range" tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(225,20%,90%)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="hsl(238,70%,55%)" />
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Case Clusters */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl p-6">
                <h3 className="font-display font-semibold text-foreground mb-1">Case Clusters</h3>
                <p className="text-xs text-muted-foreground mb-4">Topic groupings in your research</p>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={insightsData.caseClusters} dataKey="cases" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3}>
                        {insightsData.caseClusters.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(225,20%,90%)", borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full sm:w-44 space-y-2">
                    {insightsData.caseClusters.map((c, i) => (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-foreground flex-1 truncate">{c.name}</span>
                        <span className="text-xs font-semibold text-muted-foreground">{c.cases}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Search Volume */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel rounded-2xl p-6">
                <h3 className="font-display font-semibold text-foreground mb-1">Search Volume</h3>
                <p className="text-xs text-muted-foreground mb-4">Monthly search activity</p>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={insightsData.monthlySearches}>
                    <defs>
                      <linearGradient id="searchGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(238,70%,55%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(238,70%,55%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(225,20%,90%)", borderRadius: 12, fontSize: 12 }} />
                    <Area type="monotone" dataKey="searches" stroke="hsl(238,70%,55%)" fill="url(#searchGrad)" strokeWidth={2.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Trending Topics */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-panel rounded-2xl p-6">
                <h3 className="font-display font-semibold text-foreground mb-1">Trending Topics</h3>
                <p className="text-xs text-muted-foreground mb-4">Fastest growing legal AI topics</p>
                <div className="space-y-3">
                  {insightsData.trendingTopics.map((t, i) => (
                    <motion.div
                      key={t.topic}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.08 }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:bg-muted/40 hover:border-border transition-colors"
                    >
                      <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{t.topic}</p>
                        <p className="text-xs text-muted-foreground">{t.searches} searches</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                        <TrendingUp className="w-3 h-3" />
                        +{t.growth}%
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
