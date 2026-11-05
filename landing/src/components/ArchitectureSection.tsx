"use client";

import { ArrowRight, Shield, CheckCircle } from "lucide-react";

const PIPELINE_STEPS = [
  {
    step: "01",
    name: "Voice Capture & VAD",
    tech: "Silero VAD v5 • 48ms",
    desc: "Continuous neural voice activity detection listens for speech boundaries and cancels background room noise.",
  },
  {
    step: "02",
    name: "Streaming Transcription",
    tech: "Whisper STT • Editable Draft",
    desc: "Converts audio to text and populates the editable textarea, letting developers edit typos before submission.",
  },
  {
    step: "03",
    name: "Autonomous Context Crawler",
    tech: "AST Parser • Zero Clarifications",
    desc: "Crawls workspace files, discovers existing frameworks (FastAPI, React), and deduces schemas autonomously.",
  },
  {
    step: "04",
    name: "Unified Diff Generation",
    tech: "Syntax Highlighter • AST Safe",
    desc: "Generates line-level unified diffs. Validates syntax, imports, and git safety before presenting to user.",
  },
  {
    step: "05",
    name: "Validation & Test Healer",
    tech: "Pytest / Jest Runner • Auto-Repair",
    desc: "Executes test runner. If errors occur, chronological auto-repair turns craft and verify fixes automatically.",
  },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="py-24 md:py-32 bg-zinc-950 border-t border-zinc-900 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 border-b border-zinc-800/80 pb-8">
          <div>
            <div className="flex items-center gap-2 text-brand-beige font-mono text-xs uppercase tracking-widest mb-3">
              <span>Under the Hood</span>
              <span>•</span>
              <span>Autonomous Pipeline</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-white">
              End-to-End Pipeline Architecture.
            </h2>
          </div>
          <p className="text-zinc-400 text-sm md:text-base max-w-md mt-4 md:mt-0 font-normal">
            A deterministic, multi-stage state machine connecting local voice inference with your workspace code and test suites.
          </p>
        </div>

        {/* Steps Flow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {PIPELINE_STEPS.map((s, idx) => (
            <div
              key={idx}
              className="relative p-6 rounded-xl bg-black border border-zinc-800/80 hover:border-brand-brown transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-brand-sand px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                    Step {s.step}
                  </span>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <ArrowRight className="hidden md:inline w-4 h-4 text-zinc-600" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-white mb-1 tracking-tight">{s.name}</h3>
                <span className="text-[11px] font-mono text-brand-beige block mb-3">{s.tech}</span>
                <p className="text-xs text-zinc-400 leading-relaxed font-normal">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Architecture Specs Bar */}
        <div className="mt-12 p-6 rounded-xl bg-black border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">100% Local Sandboxing & Safety</h4>
              <p className="text-xs text-zinc-400">
                Diffs are dry-run validated against your Git index before application. No destructive file overwrites.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-brand-beige" />
              157 Pytest Tests Passing
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-brand-beige" />
              Zero Telemetry / Full Privacy
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

