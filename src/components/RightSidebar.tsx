import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Calendar, BarChart3 } from "lucide-react";
import DbStatusBadge from "@/components/DbStatusBadge";

const rightItems = [
  { path: "/history", label: "History", icon: Clock },
  { path: "/calendar", label: "Calendar", icon: Calendar },
  { path: "/insights", label: "Insights", icon: BarChart3 },
];

export default function RightSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="fixed right-3 top-[28%] -translate-y-1/2 z-50 flex flex-col items-center gap-2">
      <div className="glass-panel rounded-xl px-1 py-3 flex flex-col items-center gap-2.5 w-fit">
        {rightItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={item.label}
              className={`relative flex flex-col items-center gap-2 px-1.5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer w-fit ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="rightActiveTab"
                  className="absolute inset-0 rounded-lg border border-primary/60 bg-primary/8"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
              <span className="relative z-10 flex flex-col items-center gap-2">
                <item.icon className={`w-4 h-4 transition-colors ${active ? "text-primary" : ""}`} />
                <span>{item.label}</span>
              </span>
            </button>
          );
        })}

        {/* Divider */}
        <div className="w-8 h-px bg-border/60 my-0.5" />

        {/* DB Status */}
        <div className="px-0.5 py-1.5">
          <DbStatusBadge />
        </div>
      </div>
    </div>
  );
}

