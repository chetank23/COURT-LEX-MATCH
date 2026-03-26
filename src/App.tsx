import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import FloatingNav from "@/components/FloatingNav";
import AISearchLab from "./pages/AISearchLab";
import CaseExplorer from "./pages/CaseExplorer";
import PDFAnalyzer from "./pages/PDFAnalyzer";
import InsightsDashboard from "./pages/InsightsDashboard";
import HistoryTimeline from "./pages/HistoryTimeline";
import JudgesManagement from "./pages/JudgesManagement";
import HearingCalendar from "./pages/HearingCalendar";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <FloatingNav />
        <Routes>
          <Route path="/" element={<AISearchLab />} />
          <Route path="/explorer" element={<CaseExplorer />} />
          <Route path="/analyzer" element={<PDFAnalyzer />} />
          <Route path="/judges" element={<JudgesManagement />} />
          <Route path="/calendar" element={<HearingCalendar />} />
          <Route path="/insights" element={<InsightsDashboard />} />
          <Route path="/history" element={<HistoryTimeline />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
