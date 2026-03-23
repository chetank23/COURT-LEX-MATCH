import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Brain, Layers, Scale, ChevronDown, ChevronRight, Sparkles, BookOpen, Tag, Eye } from "lucide-react";
import { Section } from "@/types";
import { dataService } from "@/services/dataService";

const analysisSteps = [
  { icon: FileText, label: "Extracting text", duration: 1200 },
  { icon: Layers, label: "Identifying sections", duration: 1000 },
  { icon: Brain, label: "Understanding context", duration: 1400 },
  { icon: Scale, label: "Matching cases", duration: 1000 },
];

type Phase = "upload" | "analyzing" | "results";

function SectionCard({ section, lawyerMode }: { section: Section; lawyerMode: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const Icon = section.icon;

  const renderContent = (text: string, highlights: string[]) => {
    if (!lawyerMode) return text;
    let result = text;
    highlights.forEach((h) => {
      result = result.replace(h, `【${h}】`);
    });
    return result;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-5 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 text-left">
          <h3 className="font-display font-semibold text-foreground">{section.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          {section.matches.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent">
              {section.matches.length} matches
            </span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Summary */}
              <div className="p-4 rounded-xl gradient-surface border border-primary/10">
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI Summary</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{section.summary}</p>
              </div>

              {/* Full content */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Full Content</p>
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {renderContent(section.content, section.highlights)}
                </p>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-3 h-3 text-muted-foreground" />
                {section.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">{t}</span>
                ))}
              </div>

              {/* Matches */}
              {section.matches.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowMatches(!showMatches)}
                    className="flex items-center gap-2 text-xs font-semibold text-primary cursor-pointer hover:underline"
                  >
                    <Eye className="w-3 h-3" />
                    {showMatches ? "Hide" : "View"} Similar Cases ({section.matches.length})
                  </button>
                  <AnimatePresence>
                    {showMatches && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-2 space-y-2"
                      >
                        {section.matches.map((m) => (
                          <div key={m.title} className="p-3 rounded-xl bg-muted/50 border border-border">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-foreground">{m.title}</p>
                              <span className="text-xs font-bold gradient-text">{m.similarity}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{m.reason}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PDFAnalyzer() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [currentStep, setCurrentStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [lawyerMode, setLawyerMode] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startAnalysis = async (file: File) => {
    setSelectedFile(file);
    setPhase("analyzing");
    setCurrentStep(0);
    let step = 0;
    const advance = async () => {
      step++;
      if (step < analysisSteps.length) {
        setCurrentStep(step);
        setTimeout(advance, analysisSteps[step].duration);
      } else {
        // Analyze PDF using data service
        const analyzedSections = await dataService.analyzePDF(file);
        setSections(analyzedSections);
        if (analyzedSections.length > 0) {
          await dataService.savePDFUpload(file.name, analyzedSections.length);
        }
        setTimeout(() => setPhase("results"), 500);
      }
    };
    setTimeout(advance, analysisSteps[0].duration);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startAnalysis(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      startAnalysis(file);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 dot-grid opacity-30" />
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent/5 blur-[120px]" />

      <AnimatePresence mode="wait">
        {phase === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex items-center justify-center px-6 relative z-10"
          >
            <div className="w-full max-w-lg text-center">
              <h1 className="text-3xl font-display font-bold gradient-text mb-3">PDF Analyzer</h1>
              <p className="text-muted-foreground mb-8">Upload a legal document for AI-powered analysis</p>

              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                whileHover={{ scale: 1.02 }}
                className={`p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                  dragOver ? "border-primary bg-primary/5 glow-primary" : "border-border hover:border-primary/50"
                }`}
              >
                <Upload className={`w-12 h-12 mx-auto mb-4 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="font-medium text-foreground mb-1">Drop your PDF here</p>
                <p className="text-sm text-muted-foreground">or click to browse files</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </motion.div>
            </div>
          </motion.div>
        )}

        {phase === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center px-6 relative z-10"
          >
            <div className="w-full max-w-md">
              <div className="text-center mb-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4"
                >
                  <FileText className="w-8 h-8 text-accent" />
                </motion.div>
                <h2 className="font-display font-bold text-xl text-foreground">Analyzing Document</h2>
                <p className="text-sm text-muted-foreground mt-1">AI is processing your legal document</p>
              </div>
              <div className="space-y-3">
                {analysisSteps.map((step, i) => {
                  const StepIcon = step.icon;
                  const active = i === currentStep;
                  const done = i < currentStep;
                  return (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                        active ? "glass-panel glow-accent" : done ? "bg-accent/5" : "bg-muted/50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        active ? "bg-accent text-accent-foreground" : done ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"
                      }`}>
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <span className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-accent" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                      {active && (
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} className="ml-auto w-2 h-2 rounded-full bg-accent" />
                      )}
                      {done && <span className="ml-auto text-xs text-accent">✓</span>}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen relative z-10 pt-24 pb-12 px-6"
          >
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-display font-bold gradient-text">Document Analysis</h1>
                  <p className="text-sm text-muted-foreground mt-1">AI-structured breakdown of your legal document</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-muted-foreground">Lawyer Mode</span>
                    <button
                      onClick={() => setLawyerMode(!lawyerMode)}
                      className={`w-10 h-6 rounded-full transition-colors ${lawyerMode ? "bg-primary" : "bg-muted"} relative cursor-pointer`}
                    >
                      <motion.div
                        animate={{ x: lawyerMode ? 18 : 2 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-card shadow"
                      />
                    </button>
                  </label>
                  <button
                    onClick={() => setPhase("upload")}
                    className="px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    New Upload
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {sections.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No sections to display</p>
                  </div>
                ) : (
                  sections.map((s) => (
                    <SectionCard key={s.id} section={s} lawyerMode={lawyerMode} />
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
