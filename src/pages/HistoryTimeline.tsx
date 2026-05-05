import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Upload,
  Eye,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
} from "lucide-react";
import { TimelineEvent } from "@/types";
import { dataService } from "@/services/dataService";

const typeConfig = {
  search: {
    icon: Search,
    color: "bg-primary/10 text-primary",
    label: "Search",
  },
  upload: { icon: Upload, color: "bg-accent/10 text-accent", label: "Upload" },
  view: { icon: Eye, color: "bg-muted text-muted-foreground", label: "Viewed" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HistoryTimeline() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      const loadedEvents = await dataService.getActivityHistory();
      setEvents(loadedEvents);
      setIsLoading(false);
    };
    loadHistory();
  }, []);

  // Group by date
  const grouped = events.reduce(
    (acc, ev) => {
      const label = formatDate(ev.date);
      if (!acc[label]) acc[label] = [];
      acc[label].push(ev);
      return acc;
    },
    {} as Record<string, TimelineEvent[]>,
  );

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-20" />
      <div className="relative z-10 pt-24 pb-12 px-6 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-display font-bold gradient-text">
            Activity History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your research journey over time
          </p>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading history...
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            No activity history yet
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            {Object.entries(grouped).map(([dateLabel, events], gi) => (
              <div key={dateLabel} className="mb-8">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: gi * 0.1 }}
                  className="flex items-center gap-3 mb-4 relative"
                >
                  <div className="w-10 h-10 rounded-full bg-card border-2 border-primary flex items-center justify-center z-10">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm font-display font-semibold text-foreground">
                    {dateLabel}
                  </span>
                </motion.div>

                <div className="space-y-3 pl-14">
                  {events.map((ev, i) => {
                    const config = typeConfig[ev.type];
                    const Icon = config.icon;
                    const isExpanded = expandedId === ev.id;
                    return (
                      <motion.div
                        key={ev.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: gi * 0.1 + i * 0.05 }}
                        className="glass-panel rounded-xl overflow-hidden group"
                      >
                        <button
                          onClick={() =>
                            setExpandedId(isExpanded ? null : ev.id)
                          }
                          className="w-full flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {ev.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(ev.date)}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${config.color}`}
                          >
                            {config.label}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 pt-1 border-t border-border">
                                {ev.type === "search" && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                      Query: "{ev.title}"
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Found{" "}
                                      <span className="text-primary font-semibold">
                                        {ev.results}
                                      </span>{" "}
                                      matching cases
                                    </p>
                                    <button className="text-xs text-primary font-medium hover:underline cursor-pointer">
                                      View results →
                                    </button>
                                  </div>
                                )}
                                {ev.type === "upload" && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-accent" />
                                      <span className="text-xs text-foreground font-medium">
                                        {ev.title}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      AI identified{" "}
                                      <span className="text-accent font-semibold">
                                        {ev.results}
                                      </span>{" "}
                                      relevant sections
                                    </p>
                                    <button className="text-xs text-accent font-medium hover:underline cursor-pointer">
                                      View analysis →
                                    </button>
                                  </div>
                                )}
                                {ev.type === "view" && (
                                  <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                      Viewed case details
                                    </p>
                                    <button className="text-xs text-primary font-medium hover:underline cursor-pointer">
                                      Open case →
                                    </button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
