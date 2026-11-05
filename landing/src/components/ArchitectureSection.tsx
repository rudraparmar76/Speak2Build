"use client";

import { Mic, Brain, FileCode, TestTube, CheckCircle2 } from "lucide-react";
import FadeContent from "./reactbits/FadeContent";

const STEPS = [
  {
    icon: Mic,
    number: "01",
    title: "Speak",
    description: "Just talk. Silero VAD captures your voice in real-time and transcribes it via Whisper.",
  },
  {
    icon: Brain,
    number: "02",
    title: "Understand",
    description: "The context crawler reads your workspace — files, structure, dependencies — and feeds it to the LLM.",
  },
  {
    icon: FileCode,
    number: "03",
    title: "Generate",
    description: "The LLM generates code as a unified diff. You see exactly what will change before accepting.",
  },
  {
    icon: TestTube,
    number: "04",
    title: "Validate",
    description: "Tests run automatically after code is applied. If something breaks, the self-healer kicks in.",
  },
  {
    icon: CheckCircle2,
    number: "05",
    title: "Ship",
    description: "Accept the changes with one click. Your code is updated, tested, and ready to commit.",
  },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="py-section bg-alma-aioli relative">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        <FadeContent duration={0.7}>
          <div className="text-center mb-16">
            <span className="tag-pill mb-4 inline-block">The Pipeline</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium leading-[0.96] tracking-tight mt-4">
              From voice to code
              <br />
              <em className="text-alma-collard">in five steps.</em>
            </h2>
          </div>
        </FadeContent>

        <div className="max-w-3xl mx-auto">
          {STEPS.map((step, i) => (
            <FadeContent
              key={step.number}
              delay={i * 0.12}
              duration={0.6}
              direction="left"
              distance={20}
            >
              <div className="flex gap-6 mb-10 last:mb-0 group">
                {/* Timeline */}
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-alma-surface border border-black/5 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                    <step.icon size={20} className="text-alma-collard" />
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-px h-full min-h-[40px] bg-gradient-to-b from-black/10 to-transparent mt-2" />
                  )}
                </div>

                {/* Content */}
                <div className="pt-1 pb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-mono text-alma-muted">
                      {step.number}
                    </span>
                    <h3 className="text-lg font-semibold text-alma-teriyaki">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-sm text-alma-teriyaki/50 leading-relaxed max-w-md">
                    {step.description}
                  </p>
                </div>
              </div>
            </FadeContent>
          ))}
        </div>
      </div>
    </section>
  );
}
