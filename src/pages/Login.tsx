import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock, UserCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: string } | null)?.from || "/secure-cases";

  const [email, setEmail] = useState("staff@court.ai");
  const [password, setPassword] = useState("staff123");
  const [error, setError] = useState("");

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = login({ email, password });

    if (!result.ok) {
      setError(result.error || "Unable to sign in.");
      return;
    }

    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 dot-grid opacity-35" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_hsl(238_70%_55%_/_0.08),transparent_55%)]" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl glass-panel rounded-3xl p-8"
        >
          <p className="text-xs font-semibold tracking-[0.16em] uppercase text-primary">
            Secure Access
          </p>
          <h1 className="text-3xl font-display font-bold text-foreground mt-2">
            Court Case Workspace Login
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Judges can view assigned case intelligence. Court support staff can
            upload and manage case operations.
          </p>

          <div className="mt-5 p-4 rounded-xl border border-border/80 bg-card/60 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="text-foreground font-semibold">Judge demo:</span>{" "}
              judge@court.ai / judge123
            </p>
            <p>
              <span className="text-foreground font-semibold">Staff demo:</span>{" "}
              staff@court.ai / staff123
            </p>
          </div>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </span>
              <div className="mt-1.5 relative">
                <UserCircle2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  className="w-full rounded-xl border border-border bg-background/80 pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="name@court.ai"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </span>
              <div className="mt-1.5 relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  required
                  className="w-full rounded-xl border border-border bg-background/80 pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="Enter password"
                />
              </div>
            </label>

            {error ? (
              <p className="text-xs font-medium text-destructive">{error}</p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Sign in to Authenticated Workspace
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
