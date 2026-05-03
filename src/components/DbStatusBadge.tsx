import { useEffect, useState } from "react";
import { Database, Wifi, WifiOff } from "lucide-react";

interface DbHealth {
  ok: boolean;
  mode: "sqlite" | "memory" | "postgres";
  message: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";

function modeLabel(mode: DbHealth["mode"]) {
  if (mode === "sqlite") return "SQLite";
  if (mode === "postgres") return "PostgreSQL";
  return "In-Memory";
}

export default function DbStatusBadge() {
  const [health, setHealth] = useState<DbHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/db/health`, {
          signal: AbortSignal.timeout(3000),
        });
        const data: DbHealth = await res.json();
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled)
          setHealth({ ok: false, mode: "memory", message: "Server unreachable" });
      }
    };

    void check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!health) return null;

  return (
    <div
      title={`DB: ${health.message}`}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
        health.ok
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
      }`}
    >
      <Database className="w-3 h-3" />
      {health.ok ? (
        <>
          <Wifi className="w-3 h-3" />
          <span className="hidden md:inline">{modeLabel(health.mode)}</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span className="hidden md:inline">In-Memory</span>
        </>
      )}
    </div>
  );
}
