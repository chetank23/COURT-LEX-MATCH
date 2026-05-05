/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type UserRole = "judge" | "staff";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ManagedCase {
  id: string;
  title: string;
  status: "New" | "Under Review" | "Assigned" | "Hearing Scheduled";
  assignedJudge: string;
  uploadedBy: string;
  uploadName?: string;
  notes: string;
  autoAssigned?: boolean;
  assignmentReason?: string;
  priorityScore?: number;
  priorityBand?: "P0" | "P1" | "P2" | "P3";
  bailRiskScore?: number;
  escapeRiskScore?: number;
  riskScore?: number;
  publicDefenderStatus?: "Pending Allocation" | "Not Required";
  updatedAt: number;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => { ok: boolean; error?: string };
  logout: () => void;
  managedCases: ManagedCase[];
  isManagedCasesLoading: boolean;
  upsertManagedCase: (
    caseItem: Omit<ManagedCase, "updatedAt">,
  ) => Promise<void>;
  updateManagedCase: (
    id: string,
    updates: Partial<ManagedCase>,
  ) => Promise<void>;
  refreshManagedCases: () => Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";

const DEMO_USERS: Array<User & { password: string }> = [
  {
    id: "judge-001",
    name: "Justice N. Rao",
    email: "judge@court.ai",
    password: "judge123",
    role: "judge",
  },
  {
    id: "staff-001",
    name: "Court Support Officer",
    email: "staff@court.ai",
    password: "staff123",
    role: "staff",
  },
];

// Seed data used as fallback when the API is unreachable
const FALLBACK_MANAGED_CASES: ManagedCase[] = [
  {
    id: "case-managed-1",
    title: "State vs Kumar (Public Safety Review)",
    status: "Assigned",
    assignedJudge: "Justice N. Rao",
    uploadedBy: "Court Support Officer",
    notes: "Urgent listing requested by prosecution.",
    autoAssigned: true,
    assignmentReason: "Selected for criminal bench fit and judge availability.",
    priorityScore: 88,
    priorityBand: "P0",
    bailRiskScore: 79,
    escapeRiskScore: 72,
    riskScore: 76,
    publicDefenderStatus: "Pending Allocation",
    updatedAt: Date.now(),
  },
  {
    id: "case-managed-2",
    title: "Anita Sharma vs Metro Developers",
    status: "Under Review",
    assignedJudge: "Justice R. Iyer",
    uploadedBy: "Court Support Officer",
    notes: "Awaiting affidavit verification.",
    autoAssigned: false,
    assignmentReason: "Manual assignment retained for ongoing review.",
    priorityScore: 62,
    priorityBand: "P2",
    bailRiskScore: 24,
    escapeRiskScore: 18,
    riskScore: 21,
    publicDefenderStatus: "Not Required",
    updatedAt: Date.now(),
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });
    if (!res.ok || res.status === 204) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [managedCases, setManagedCases] = useState<ManagedCase[]>(
    FALLBACK_MANAGED_CASES,
  );
  const [isManagedCasesLoading, setIsManagedCasesLoading] = useState(false);
  const fetchedRef = useRef(false);

  // ── Fetch managed cases from API ──────────────────────────────────────────
  const refreshManagedCases = useCallback(async () => {
    setIsManagedCasesLoading(true);
    try {
      const fromApi = await apiFetch<ManagedCase[]>("/api/managed-cases");
      if (fromApi && Array.isArray(fromApi) && fromApi.length > 0) {
        setManagedCases(fromApi);
      }
    } finally {
      setIsManagedCasesLoading(false);
    }
  }, []);

  // Load once on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void refreshManagedCases();
  }, [refreshManagedCases]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const login = ({ email, password }: LoginPayload) => {
    const foundUser = DEMO_USERS.find(
      (c) =>
        c.email.toLowerCase() === email.trim().toLowerCase() &&
        c.password === password,
    );
    if (!foundUser) {
      return {
        ok: false,
        error:
          "Invalid credentials. Use judge@court.ai / judge123 or staff@court.ai / staff123",
      };
    }
    const { password: _ignored, ...safeUser } = foundUser;
    setUser(safeUser);
    return { ok: true };
  };

  const logout = () => setUser(null);

  // ── Managed case mutations (optimistic + API sync) ────────────────────────
  const upsertManagedCase = useCallback(
    async (caseItem: Omit<ManagedCase, "updatedAt">) => {
      const full: ManagedCase = { ...caseItem, updatedAt: Date.now() };

      // Optimistic update
      setManagedCases((prev) => {
        const exists = prev.find((e) => e.id === caseItem.id);
        if (exists) {
          return prev.map((e) => (e.id === caseItem.id ? full : e));
        }
        return [full, ...prev];
      });

      // Persist to API
      const existing = managedCases.find((c) => c.id === caseItem.id);
      if (existing) {
        await apiFetch(
          `/api/managed-cases/${encodeURIComponent(caseItem.id)}`,
          {
            method: "PUT",
            body: JSON.stringify(caseItem),
          },
        );
      } else {
        await apiFetch("/api/managed-cases", {
          method: "POST",
          body: JSON.stringify(caseItem),
        });
      }
    },
    [managedCases],
  );

  const updateManagedCase = useCallback(
    async (id: string, updates: Partial<ManagedCase>) => {
      // Optimistic update
      setManagedCases((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e,
        ),
      );

      // Persist to API
      await apiFetch(`/api/managed-cases/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
      managedCases,
      isManagedCasesLoading,
      upsertManagedCase,
      updateManagedCase,
      refreshManagedCases,
    }),
    [
      user,
      managedCases,
      isManagedCasesLoading,
      upsertManagedCase,
      updateManagedCase,
      refreshManagedCases,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
