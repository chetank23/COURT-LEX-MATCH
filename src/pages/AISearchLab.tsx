import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, Zap, Brain, Network, ArrowRight, Scale } from "lucide-react";
import { CaseResult } from "@/types";
import { dataService } from "@/services/dataService";

const aiSteps = [
  { icon: Brain, label: "Understanding context", duration: 800 },
  { icon: Network, label: "Generating embeddings", duration: 1000 },
  { icon: Scale, label: "Matching precedents", duration: 1200 },
];

function TypingText({ text, speed = 20 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return <>{displayed}</>;
}

function SimilarityBar({ score, delay }: { score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, hsl(238 70% 55%), hsl(270 60% 60%))`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 1, delay: delay / 1000, ease: "easeOut" }}
        />
      </div>
      <span className="text-sm font-semibold font-display text-primary min-w-[40px]">{score}%</span>
    </div>
  );
}

function ResultCard({ result, index }: { result: CaseResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
      className="glass-panel rounded-2xl p-5 hover:glow-primary transition-all cursor-pointer group"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors">{result.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{result.court} · {result.year}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {result.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">{tag}</span>
          ))}
        </div>
      </div>
      <SimilarityBar score={result.similarity} delay={index * 150 + 300} />
      <div className="mt-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <TypingText text={result.summary} speed={8} />
        </p>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">Why this matches</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.whyMatch}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type Phase = "idle" | "transition" | "analyzing" | "results";

export default function AISearchLab() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setPhase("transition");
    setIsLoading(true);
    setTimeout(() => {
      setPhase("analyzing");
      setCurrentStep(0);
      let step = 0;
      const advance = async () => {
        step++;
        if (step < aiSteps.length) {
          setCurrentStep(step);
          setTimeout(advance, aiSteps[step].duration);
        } else {
          // Fetch results from data service
          const searchResults = await dataService.searchCases(query);
          setResults(searchResults);
          setIsLoading(false);
          setTimeout(() => setPhase("results"), 600);
        }
      };
      setTimeout(advance, aiSteps[0].duration);
    }, 2000);
  };

  const handleReset = () => {
    setPhase("idle");
    setQuery("");
    setCurrentStep(0);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background pattern */}
      <div className="fixed inset-0 dot-grid opacity-50" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />

      <AnimatePresence mode="wait">
        {/* IDLE STATE */}
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30 }}
            className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 20 }}
              className="text-center mb-10"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold gradient-text mb-4">
                AI Search Lab
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                Describe your case in plain English. Our AI understands legal meaning, not just keywords.
              </p>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="w-full max-w-2xl relative floating-glow rounded-2xl"
            >
              <div className="glass-panel rounded-2xl p-2">
                <div className="flex items-center gap-3">
                  <div className="pl-4">
                    <Search className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Describe your case in plain English…"
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none py-4 text-base"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!query.trim()}
                    className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    Search
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                No keywords needed. Just explain the situation.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-12 flex flex-wrap justify-center gap-2"
            >
              {["AI liability in automated decisions", "Data privacy in healthcare AI", "Autonomous vehicle negligence"].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
                  className="px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                >
                  {ex}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* TRANSITION STATE */}
        {phase === "transition" && (
          <motion.div
            key="transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center relative z-10"
          >
            <div className="text-center">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xl text-muted-foreground font-display"
              >
                ⏳ Traditional systems take hours…
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-2xl font-display font-bold gradient-text mt-4"
              >
                ⚡ LexMatch AI is analyzing meaning…
              </motion.p>
            </div>
          </motion.div>
        )}

        {/* ANALYZING STATE */}
        {phase === "analyzing" && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center relative z-10"
          >
            <div className="w-full max-w-md px-6">
              <div className="text-center mb-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"
                >
                  <Brain className="w-8 h-8 text-primary" />
                </motion.div>
                <p className="font-display font-semibold text-foreground text-lg">Analyzing your query</p>
                <p className="text-sm text-muted-foreground mt-1">"{query}"</p>
              </div>

              <div className="space-y-4">
                {aiSteps.map((step, i) => {
                  const StepIcon = step.icon;
                  const active = i === currentStep;
                  const done = i < currentStep;
                  return (
                    <motion.div
                      key={step.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                        active ? "glass-panel glow-primary" : done ? "bg-primary/5" : "bg-muted/50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        active ? "bg-primary text-primary-foreground" : done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        <StepIcon className="w-5 h-5" />
                      </div>
                      <span className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                      {active && (
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="ml-auto w-2 h-2 rounded-full bg-primary"
                        />
                      )}
                      {done && <span className="ml-auto text-xs text-primary">✓</span>}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* RESULTS STATE */}
        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen relative z-10 pt-24 pb-12 px-6"
          >
            <div className="max-w-3xl mx-auto">
              <motion.div
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-8"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Results for</p>
                    <h2 className="text-xl font-display font-bold text-foreground">"{query}"</h2>
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    New Search <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Found <span className="text-primary font-semibold">{results.length}</span> matching precedents
                </p>
              </motion.div>

              <div className="space-y-4">
                {results.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No results found. Please try a different query.</p>
                  </div>
                ) : (
                  results.map((c, i) => (
                    <ResultCard key={c.id} result={c} index={i} />
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
