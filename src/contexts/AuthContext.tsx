import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type UserRole = "judge" | "staff";

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface ManagedCase {
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
  upsertManagedCase: (caseItem: Omit<ManagedCase, "updatedAt">) => void;
  updateManagedCase: (id: string, updates: Partial<ManagedCase>) => void;
}

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

const INITIAL_MANAGED_CASES: ManagedCase[] = [
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [managedCases, setManagedCases] = useState<ManagedCase[]>(INITIAL_MANAGED_CASES);

  const login = ({ email, password }: LoginPayload) => {
    const foundUser = DEMO_USERS.find(
      (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase() && candidate.password === password
    );

    if (!foundUser) {
      return { ok: false, error: "Invalid credentials. Use judge@court.ai / judge123 or staff@court.ai / staff123" };
    }

    const { password: _ignored, ...safeUser } = foundUser;
    setUser(safeUser);
    return { ok: true };
  };

  const logout = () => {
    setUser(null);
  };

  const upsertManagedCase = (caseItem: Omit<ManagedCase, "updatedAt">) => {
    setManagedCases((prev) => {
      const existing = prev.find((entry) => entry.id === caseItem.id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === caseItem.id
            ? {
                ...entry,
                ...caseItem,
                updatedAt: Date.now(),
              }
            : entry
        );
      }

      return [{ ...caseItem, updatedAt: Date.now() }, ...prev];
    });
  };

  const updateManagedCase = (id: string, updates: Partial<ManagedCase>) => {
    setManagedCases((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              ...updates,
              updatedAt: Date.now(),
            }
          : entry
      )
    );
  };

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      logout,
      managedCases,
      upsertManagedCase,
      updateManagedCase,
    }),
    [user, managedCases]
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

export type { ManagedCase };
