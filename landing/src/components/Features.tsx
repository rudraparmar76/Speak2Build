"use client";

import {
  Mic,
  Brain,
  FileCode,
  TestTube,
  Wrench,
  Shield,
  Settings,
  Headphones,
} from "lucide-react";
import FadeContent from "./reactbits/FadeContent";

const FEATURES = [
  {
    icon: Mic,
    title: "Silero VAD",
    description: "Always-on voice activity detection with sub-200ms latency. No wake words needed.",
  },
  {
    icon: Brain,
    title: "Multi-LLM Support",
    description: "Works with OpenAI, Anthropic, Google, Groq, Ollama, and any OpenAI-compatible API.",
  },
  {
    icon: FileCode,
    title: "Inline Unified Diffs",
    description: "See exactly what changed. Accept, reject, or view full file with one click.",
  },
  {
    icon: TestTube,
    title: "Auto Test Runner",
    description: "Automatically discovers and runs pytest after code generation. One-click validation.",
  },
  {
    icon: Wrench,
    title: "Self-Healing Repair",
    description: "Failed tests? The AI reads errors, generates fixes, and re-runs — automatically.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description: "Your API keys, your LLM. Nothing leaves your machine except what you explicitly send.",
  },
  {
    icon: Settings,
    title: "Fully Configurable",
    description: "Choose your LLM provider, model, temperature, and system prompts. Your setup, your way.",
  },
  {
    icon: Headphones,
    title: "TTS Feedback",
    description: "Optional text-to-speech reads AI responses aloud. True hands-free pair programming.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-section bg-alma-yogurt relative">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        <FadeContent duration={0.7}>
          <div className="text-center mb-16">
            <span className="tag-pill mb-4 inline-block">Features</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium leading-[0.96] tracking-tight mt-4">
              Everything you need,
              <br />
              <em className="text-alma-collard">nothing you don&apos;t.</em>
            </h2>
          </div>
        </FadeContent>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((feature, i) => (
            <FadeContent key={feature.title} delay={i * 0.08} duration={0.5}>
              <div className="card-alma p-6 h-full">
                <div className="w-10 h-10 rounded-xl bg-alma-kiwi/10 flex items-center justify-center mb-4">
                  <feature.icon size={18} className="text-alma-collard" />
                </div>
                <h3 className="text-sm font-semibold text-alma-teriyaki mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-alma-teriyaki/45 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </FadeContent>
          ))}
        </div>
      </div>
    </section>
  );
}
