import { motion } from "framer-motion";

type OrbSpec = {
  className: string;
  duration: number;
  x: number[];
  y: number[];
  scale: number[];
};

type LegalMarker = {
  label: string;
  left: string;
  top: string;
  delay: number;
};

const ORBS: OrbSpec[] = [
  {
    className: "absolute -top-28 right-[6%] h-[36rem] w-[36rem] rounded-full bg-primary/11 blur-[125px]",
    duration: 26,
    x: [0, -50, 30, 0],
    y: [0, 40, -25, 0],
    scale: [1, 1.08, 0.94, 1],
  },
  {
    className: "absolute -bottom-24 left-[2%] h-[30rem] w-[30rem] rounded-full bg-accent/12 blur-[115px]",
    duration: 22,
    x: [0, 38, -26, 0],
    y: [0, -30, 34, 0],
    scale: [1, 0.9, 1.05, 1],
  },
  {
    className: "absolute top-[20%] left-[28%] h-[22rem] w-[22rem] rounded-full bg-primary/8 blur-[95px]",
    duration: 18,
    x: [0, 24, -20, 0],
    y: [0, -22, 18, 0],
    scale: [1, 1.06, 0.96, 1],
  },
];

const LEGAL_MARKERS: LegalMarker[] = [
  { label: "SEC 302", left: "10%", top: "20%", delay: 0.2 },
  { label: "CIVIL", left: "22%", top: "68%", delay: 1.4 },
  { label: "ORDER", left: "39%", top: "34%", delay: 2.2 },
  { label: "FIR", left: "55%", top: "75%", delay: 1.1 },
  { label: "APPEAL", left: "70%", top: "26%", delay: 3.3 },
  { label: "TRIAL", left: "84%", top: "58%", delay: 2.7 },
];

const COURT_COLUMNS = [
  { left: "6%", height: "34%" },
  { left: "14%", height: "38%" },
  { left: "82%", height: "37%" },
  { left: "90%", height: "33%" },
];

export default function LiveMotionBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 18% 14%, hsl(var(--primary) / 0.10), transparent 55%), radial-gradient(95% 80% at 82% 86%, hsl(var(--accent) / 0.09), transparent 60%)",
        }}
        animate={{ opacity: [0.8, 1, 0.82] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0px, transparent 24px, hsl(var(--primary) / 0.08) 25px, transparent 26px)",
          backgroundSize: "220px 100%",
        }}
        animate={{ backgroundPositionX: ["0px", "220px"] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      />

      {ORBS.map((orb) => (
        <motion.div
          key={orb.className}
          className={orb.className}
          animate={{ x: orb.x, y: orb.y, scale: orb.scale }}
          transition={{ duration: orb.duration, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {COURT_COLUMNS.map((column, index) => (
        <motion.div
          key={column.left}
          className="absolute bottom-0 w-12 rounded-t-3xl border border-primary/15 bg-gradient-to-t from-primary/10 via-primary/6 to-transparent"
          style={{ left: column.left, height: column.height }}
          animate={{ opacity: [0.22, 0.38, 0.22], scaleY: [1, 1.03, 1] }}
          transition={{ duration: 6 + index, repeat: Infinity, ease: "easeInOut", delay: index * 0.4 }}
        />
      ))}

      <motion.div
        className="absolute left-0 right-0 bottom-[18%] h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent"
        animate={{ opacity: [0.2, 0.6, 0.2], scaleX: [0.94, 1, 0.94] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.svg
        viewBox="0 0 600 260"
        className="absolute left-1/2 top-[44%] h-[210px] w-[460px] -translate-x-1/2 -translate-y-1/2 text-primary/30"
        animate={{ y: [0, -8, 0], rotate: [0, 1.2, -1.2, 0], opacity: [0.28, 0.4, 0.28] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1="300" y1="56" x2="300" y2="188" stroke="currentColor" strokeWidth="4" />
        <line x1="180" y1="90" x2="420" y2="90" stroke="currentColor" strokeWidth="4" />
        <line x1="250" y1="90" x2="250" y2="125" stroke="currentColor" strokeWidth="2.5" />
        <line x1="350" y1="90" x2="350" y2="125" stroke="currentColor" strokeWidth="2.5" />

        <motion.g animate={{ y: [0, 6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
          <path d="M206 126 C224 170 276 170 294 126 Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
        </motion.g>
        <motion.g animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
          <path d="M306 126 C324 170 376 170 394 126 Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
        </motion.g>

        <rect x="255" y="188" width="90" height="10" rx="5" fill="currentColor" fillOpacity="0.4" />
      </motion.svg>

      <motion.div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(115deg, transparent 0%, hsl(var(--primary) / 0.18) 45%, transparent 70%)",
          backgroundSize: "220% 220%",
        }}
        animate={{ backgroundPosition: ["0% 20%", "100% 80%", "0% 20%"] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      />

      <div className="absolute inset-0 dot-grid opacity-30" />

      {LEGAL_MARKERS.map((marker, index) => (
        <motion.div
          key={marker.label + marker.left}
          className="absolute rounded-full border border-primary/20 bg-card/30 px-3 py-1 text-[10px] font-semibold tracking-[0.12em] text-primary/70 backdrop-blur-sm"
          style={{ left: marker.left, top: marker.top }}
          animate={{ y: [0, -14, 0], opacity: [0.3, 0.72, 0.3], scale: [0.96, 1.04, 0.96] }}
          transition={{
            duration: 5.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: marker.delay + index * 0.18,
          }}
        >
          {marker.label}
        </motion.div>
      ))}
    </div>
  );
}
