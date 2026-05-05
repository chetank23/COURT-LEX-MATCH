import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SearchProvider } from "@/contexts/SearchContext";
import { AuthProvider } from "@/contexts/AuthContext";
import FloatingNav from "@/components/FloatingNav";
import RightSidebar from "@/components/RightSidebar";
import ProtectedRoute from "@/components/ProtectedRoute";
import AISearchLab from "./pages/AISearchLab";
import CaseExplorer from "./pages/CaseExplorer";
import PDFAnalyzer from "./pages/PDFAnalyzer";
import JudgeAssignmentCenter from "./pages/JudgeAssignmentCenter";
import InsightsDashboard from "./pages/InsightsDashboard";
import CasePriorityDashboard from "./pages/CasePriorityDashboard";
import HistoryTimeline from "./pages/HistoryTimeline";
import JudgesManagement from "./pages/JudgesManagement";
import HearingCalendar from "./pages/HearingCalendar";
import Login from "./pages/Login";
import SecureCaseWorkspace from "./pages/SecureCaseWorkspace";
import CaseAnalysis from "./pages/CaseAnalysis";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <SearchProvider>
          <BrowserRouter>
            <FloatingNav />
            <RightSidebar />
            <Routes>
              <Route path="/" element={<AISearchLab />} />
              <Route path="/explorer" element={<CaseExplorer />} />
              <Route path="/analyzer" element={<PDFAnalyzer />} />
              <Route path="/judges" element={<JudgesManagement />} />
              <Route path="/calendar" element={<HearingCalendar />} />
              <Route path="/insights" element={<InsightsDashboard />} />
              <Route path="/priority" element={<CasePriorityDashboard />} />
              <Route path="/analysis" element={<CaseAnalysis />} />
              <Route path="/history" element={<HistoryTimeline />} />
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/assign-judges" element={<JudgeAssignmentCenter />} />
                <Route path="/secure-cases" element={<SecureCaseWorkspace />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SearchProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
