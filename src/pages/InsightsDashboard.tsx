import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";
import { InsightsData } from "@/types";
import { dataService } from "@/services/dataService";

const COLORS = ["hsl(238,70%,55%)", "hsl(270,60%,60%)", "hsl(200,70%,50%)", "hsl(160,60%,45%)", "hsl(30,70%,55%)"];

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
  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-20" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text">Insights Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">AI analytics across your legal research</p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading insights...</div>
        ) : insightsData.similarityDistribution.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No insights available yet</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Similarity Distribution */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-2xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-1">Similarity Distribution</h3>
            <p className="text-xs text-muted-foreground mb-4">How closely cases match your queries</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={insightsData.similarityDistribution}>
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(225,20%,90%)", borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(238,70%,55%)" />
              </BarChart>
            </ResponsiveContainer>
            </motion.div>

          {/* Case Clusters */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-1">Case Clusters</h3>
            <p className="text-xs text-muted-foreground mb-4">Topic groupings in your research</p>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={insightsData.caseClusters} dataKey="cases" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {insightsData.caseClusters.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(225,20%,90%)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {insightsData.caseClusters.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: COLORS[i] }} />
                    <span className="text-xs text-foreground flex-1">{c.name}</span>
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
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={insightsData.monthlySearches}>
                <defs>
                  <linearGradient id="searchGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(238,70%,55%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(238,70%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(225,10%,50%)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(0,0%,100%)", border: "1px solid hsl(225,20%,90%)", borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="searches" stroke="hsl(238,70%,55%)" fill="url(#searchGrad)" strokeWidth={2} />
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
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
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
        )}
      </div>
    </div>
  );
}
