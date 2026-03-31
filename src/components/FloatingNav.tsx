import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Layers, FileText, BarChart3, Clock, Users, Calendar, ShieldCheck, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { path: "/", label: "AI Search Lab", icon: Search },
  { path: "/explorer", label: "Case Explorer", icon: Layers },
  { path: "/analyzer", label: "PDF Analyzer", icon: FileText },
  { path: "/judges", label: "Judges", icon: Users },
  { path: "/calendar", label: "Calendar", icon: Calendar },
  { path: "/insights", label: "Insights", icon: BarChart3 },
  { path: "/history", label: "History", icon: Clock },
  { path: "/secure-cases", label: "Secure Cases", icon: ShieldCheck },
];

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-3 px-3">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass-panel rounded-xl px-1.5 py-1 flex items-center gap-0.5"
      >
        <div className="px-2.5 mr-0.5">
          <span className="text-sm font-display font-bold gradient-text">CASE UPHOLDER</span>
        </div>
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary rounded-lg"
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

        {isAuthenticated ? (
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={`Logged in as ${user?.name || "User"}`}
          >
            <span className="relative z-10 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </span>
          </button>
        ) : (
          <button
            onClick={() => navigate("/login")}
            className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <span className="relative z-10 flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Login</span>
            </span>
          </button>
        )}
      </motion.nav>
    </div>
  );
}
