"use client";

import { Mic, Brain, GitPullRequest, Stethoscope } from "lucide-react";

const WORKERS = [
  {
    id: "01",
    role: "The Voice Conductor",
    tagline: "Always-Listening Neural VAD & Barge-In",
    description:
      "Powered by an ultra-lightweight 48ms Silero VAD neural network. Speak naturally without holding down buttons. Transcribes your speech into an editable draft so you can review and correct misheard words before executing.",
    icon: Mic,
    badge: "Voice & Speech",
    highlights: ["48ms Silero VAD v5", "Voice barge-in interruption", "Editable transcription draft"],
  },
  {
    id: "02",
    role: "The Workspace Crawler",
    tagline: "Autonomous Context & Zero Annoying Q&As",
    description:
      "Instead of asking you tedious questions about endpoint shapes or edge cases, the crawler reads your codebase, inspects existing conventions, and deduces types and test frameworks autonomously.",
    icon: Brain,
    badge: "AST Intelligence",
    highlights: ["AST repository crawling", "Zero clarification questions", "Framework auto-detection"],
  },
  {
    id: "03",
    role: "The Diff Architect",
    tagline: "Precision Syntax Diffs & Safe Application",
    description:
      "Generates unified syntax diffs with line-by-line clarity directly inside your chat stream. Supports voice commands like 'apply it', 'accept all', and 'reject' without touching your mouse.",
    icon: GitPullRequest,
    badge: "Code Synthesis",
    highlights: ["Unified diff previews", "AST syntax safety check", "Sequential batch apply"],
  },
  {
    id: "04",
    role: "The Self-Healing Healer",
    tagline: "Automated Pytest Runner & Repair Loop",
    description:
      "Directly executes your workspace test suite (pytest, npm test, cargo test). If a test breaks, simply say 'fix it' to generate surgical repair diffs rendered chronologically below the failure.",
    icon: Stethoscope,
    badge: "Validation & QA",
    highlights: ["pytest / npm test runner", "Chronological repair turns", "Traceback auto-diagnosis"],
  },
];

export function DigitalWorkers() {
  return (
    <section id="workers" className="py-24 md:py-32 bg-zinc-950 border-t border-zinc-900 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 border-b border-zinc-800/80 pb-8">
          <div>
            <div className="flex items-center gap-2 text-brand-beige font-mono text-xs uppercase tracking-widest mb-3">
              <span>Autonomous Engineering</span>
              <span>•</span>
              <span>Specialized Sub-Engines</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-white">
              Meet Your 4 Digital Workers.
            </h2>
          </div>
          <p className="text-zinc-400 text-sm md:text-base max-w-md mt-4 md:mt-0 font-normal">
            Each worker handles a specialized phase of the development lifecycle — from audio capture to self-healing test execution.
          </p>
        </div>

        {/* 4 Workers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {WORKERS.map((worker) => {
            const Icon = worker.icon;
            return (
              <div
                key={worker.id}
                className="group relative rounded-2xl bg-zinc-900/40 border border-zinc-800/90 hover:border-brand-brown/70 p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-brand-brown/10"
              >
                <div>
                  {/* Top Bar with Number & Badge */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-2xl font-bold text-zinc-600 group-hover:text-brand-beige transition-colors">
                      {worker.id}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-zinc-950 border border-zinc-800 text-xs font-mono text-brand-sand">
                      {worker.badge}
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-accent/40 to-black border border-brand-brown/40 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                    <Icon className="w-6 h-6 text-brand-beige" />
                  </div>

                  <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-white mb-2">
                    {worker.role}
                  </h3>
                  <p className="text-xs font-mono text-brand-lightBrown mb-4 tracking-wide">
                    {worker.tagline}
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-6 font-normal">
                    {worker.description}
                  </p>
                </div>

                {/* Highlights List */}
                <div className="pt-6 border-t border-zinc-800/60 flex flex-wrap gap-2">
                  {worker.highlights.map((h, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono text-zinc-300"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

