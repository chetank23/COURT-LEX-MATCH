import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Layers, FileText, BarChart3, Clock } from "lucide-react";

const navItems = [
  { path: "/", label: "AI Search Lab", icon: Search },
  { path: "/explorer", label: "Case Explorer", icon: Layers },
  { path: "/analyzer", label: "PDF Analyzer", icon: FileText },
  { path: "/insights", label: "Insights", icon: BarChart3 },
  { path: "/history", label: "History", icon: Clock },
];

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass-panel rounded-2xl px-2 py-1.5 flex items-center gap-1"
      >
        <div className="px-3 mr-1">
          <span className="text-sm font-display font-bold gradient-text">LexMatch AI</span>
        </div>
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary rounded-xl"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </button>
          );
        })}
      </motion.nav>
    </div>
  );
}
