import { createContext, useState, useContext, ReactNode } from "react";
import { CaseResult, HearingSchedule } from "@/types";

type WorkflowMode = "find-cases" | "assign-judge";
type Phase = "idle" | "choice" | "transition" | "analyzing" | "results";

interface SearchState {
  // Case Lab data
  aiSearchQuery: string | null;
  aiSearchResults: CaseResult[];
  
  // PDF Analyzer data
  pdfAnalysisResults: CaseResult[];
  
  // Combined matched cases
  matchedCases: CaseResult[];
  
  // Flag to determine if there's any user-generated data
  hasUserData: boolean;

  // Case Lab UI State (persisted)
  aiLabPhase: Phase;
  aiLabWorkflowMode: WorkflowMode;
  aiLabCurrentStep: number;
  aiLabIsLoading: boolean;

  // PDF Analyzer UI State (persisted)
  pdfPhase: string;
  pdfIsLoading: boolean;

  // Hearing Calendar State (persisted)
  hearings: HearingSchedule[];

  // Insights Dashboard State
  lastInsightsRefresh: number;

  // Session and timestamp data
  sessionId: string;
  createdAt: number;
}

interface SearchContextType {
  state: SearchState;
  setAISearchData: (query: string, results: CaseResult[]) => void;
  setPDFAnalysisData: (results: CaseResult[]) => void;
  clearSearchData: () => void;
  updateAILabState: (updates: Partial<SearchState>) => void;
  updatePDFState: (updates: Partial<SearchState>) => void;
  updateHearings: (hearings: HearingSchedule[]) => void;
  addHearing: (hearing: HearingSchedule) => void;
  updateHearing: (hearing: HearingSchedule) => void;
  deleteHearing: (id: string) => void;
  startNewSession: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

// Generate unique session ID
const generateSessionId = () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Default state
const defaultState: SearchState = {
  aiSearchQuery: null,
  aiSearchResults: [],
  pdfAnalysisResults: [],
  matchedCases: [],
  hasUserData: false,
  aiLabPhase: "idle",
  aiLabWorkflowMode: "find-cases",
  aiLabCurrentStep: 0,
  aiLabIsLoading: false,
  pdfPhase: "upload",
  pdfIsLoading: false,
  hearings: [],
  lastInsightsRefresh: 0,
  sessionId: generateSessionId(),
  createdAt: Date.now(),
};

export const SearchProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SearchState>(defaultState);

  const setAISearchData = (query: string, results: CaseResult[]) => {
    setState((prev) => ({
      ...prev,
      aiSearchQuery: query,
      aiSearchResults: results,
      matchedCases: results,
      hasUserData: true,
      aiLabPhase: "results",
    }));
  };

  const setPDFAnalysisData = (results: CaseResult[]) => {
    setState((prev) => ({
      ...prev,
      pdfAnalysisResults: results,
      matchedCases: results,
      hasUserData: true,
      pdfPhase: "results",
    }));
  };

  const clearSearchData = () => {
    setState((prev) => ({
      ...defaultState,
      sessionId: prev.sessionId, // Keep same session
      createdAt: prev.createdAt,
      hearings: prev.hearings, // Preserve hearings
    }));
  };

  const updateAILabState = (updates: Partial<SearchState>) => {
    setState((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const updatePDFState = (updates: Partial<SearchState>) => {
    setState((prev) => ({
      ...prev,
      ...updates,
    }));
  };

  const updateHearings = (hearings: HearingSchedule[]) => {
    setState((prev) => ({
      ...prev,
      hearings,
    }));
  };

  const addHearing = (hearing: HearingSchedule) => {
    setState((prev) => {
      const placeTimeConflict = prev.hearings.find(
        (item) =>
          item.caseId !== hearing.caseId &&
          item.hearingDate === hearing.hearingDate &&
          normalizeHearingTime(item.hearingTime) === normalizeHearingTime(hearing.hearingTime) &&
          normalizeHearingTime(item.localCourtName) === normalizeHearingTime(hearing.localCourtName) &&
          normalizeHearingTime(item.courtRoom) === normalizeHearingTime(hearing.courtRoom)
      );

      if (placeTimeConflict) {
        return prev;
      }

      const duplicate = prev.hearings.find(
        (item) =>
          item.caseId === hearing.caseId &&
          item.hearingDate === hearing.hearingDate &&
          normalizeHearingTime(item.hearingTime) === normalizeHearingTime(hearing.hearingTime)
      );

      if (!duplicate) {
        return {
          ...prev,
          hearings: [...prev.hearings, hearing],
        };
      }

      return {
        ...prev,
        hearings: prev.hearings.map((item) =>
          item.id === duplicate.id
            ? {
                ...item,
                ...hearing,
                id: duplicate.id,
                caseId: duplicate.caseId,
                hearingDate: duplicate.hearingDate,
                hearingTime: duplicate.hearingTime,
              }
            : item
        ),
      };
    });
  };

  const updateHearing = (hearing: HearingSchedule) => {
    setState((prev) => ({
      ...prev,
      hearings: prev.hearings.map((h) => (h.id === hearing.id ? hearing : h)),
    }));
  };

  const deleteHearing = (id: string) => {
    setState((prev) => ({
      ...prev,
      hearings: prev.hearings.filter((h) => h.id !== id),
    }));
  };

  const startNewSession = () => {
    setState((prev) => ({
      ...defaultState,
      sessionId: generateSessionId(),
      createdAt: Date.now(),
    }));
  };

  return (
    <SearchContext.Provider
      value={{
        state,
        setAISearchData,
        setPDFAnalysisData,
        clearSearchData,
        updateAILabState,
        updatePDFState,
        updateHearings,
        addHearing,
        updateHearing,
        deleteHearing,
        startNewSession,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within SearchProvider");
  }
  return context;
};

function normalizeHearingTime(value: string) {
  return `${value || ""}`.trim().toLowerCase();
}
