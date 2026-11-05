"use client";

import { Mic, Eye, FileCode, Wrench, ArrowRight } from "lucide-react";
import FadeContent from "./reactbits/FadeContent";

const WORKERS = [
  {
    icon: Mic,
    name: "Voice Agent",
    tagline: "Speak naturally",
    description:
      "Real-time Silero VAD detects speech instantly. No wake words, no buttons — just start talking and your intent becomes code.",
    color: "bg-alma-kiwi/15",
    iconColor: "text-alma-collard",
    stat: "< 200ms",
    statLabel: "latency",
  },
  {
    icon: Eye,
    name: "Context Crawler",
    tagline: "Reads your workspace",
    description:
      "Autonomously crawls project files, dependencies, and structure. Understands your codebase so the AI generates contextually accurate code.",
    color: "bg-alma-teal/10",
    iconColor: "text-alma-teal",
    stat: "100+",
    statLabel: "file types",
  },
  {
    icon: FileCode,
    name: "Diff Engine",
    tagline: "Inline unified diffs",
    description:
      "See exactly what changed with beautiful inline diffs. Accept or reject each change with a click — full control over every line.",
    color: "bg-orange-50",
    iconColor: "text-orange-600",
    stat: "1-click",
    statLabel: "accept/reject",
  },
  {
    icon: Wrench,
    name: "Self-Healer",
    tagline: "Auto-repairs tests",
    description:
      "When tests fail, the AI diagnoses the issue, generates a fix, and re-runs — no manual intervention required.",
    color: "bg-purple-50",
    iconColor: "text-purple-600",
    stat: "Auto",
    statLabel: "repair loop",
  },
];

export function DigitalWorkers() {
  return (
    <section className="py-section bg-alma-aioli relative">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        <FadeContent duration={0.7}>
          <div className="text-center mb-16">
            <span className="tag-pill mb-4 inline-block">How it works</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium leading-[0.96] tracking-tight mt-4">
              Four AI agents,
              <br />
              <em className="text-alma-collard">one voice.</em>
            </h2>
            <p className="text-alma-teriyaki/50 text-lg mt-4 max-w-xl mx-auto">
              Speak2Build coordinates four specialized agents that work together to
              turn your voice into production-ready code.
            </p>
          </div>
        </FadeContent>

        <div className="grid md:grid-cols-2 gap-6">
          {WORKERS.map((worker, i) => (
            <FadeContent key={worker.name} delay={i * 0.15} duration={0.6}>
              <div className="card-alma p-8 h-full group">
                <div className="flex items-start justify-between mb-6">
                  <div
                    className={`w-12 h-12 rounded-2xl ${worker.color} flex items-center justify-center`}
                  >
                    <worker.icon size={22} className={worker.iconColor} />
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-semibold text-alma-teriyaki">
                      {worker.stat}
                    </div>
                    <div className="text-xs text-alma-muted">{worker.statLabel}</div>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-alma-teriyaki mb-1">
                  {worker.name}
                </h3>
                <p className="text-sm text-alma-collard font-medium mb-3">
                  {worker.tagline}
                </p>
                <p className="text-sm text-alma-teriyaki/50 leading-relaxed">
                  {worker.description}
                </p>

                <div className="mt-6 flex items-center gap-1 text-sm text-alma-collard opacity-0 group-hover:opacity-100 transition-opacity">
                  Learn more <ArrowRight size={14} />
                </div>
              </div>
            </FadeContent>
          ))}
        </div>
      </div>
    </section>
  );
}
