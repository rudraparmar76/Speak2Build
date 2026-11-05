"use client";

import {
  Mic2,
  Edit3,
  CheckCircle,
  FileDiff,
  TerminalSquare,
  KeyRound,
  Compass,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Mic2,
    title: "Always-Listening with Voice Barge-In",
    description:
      "Run hands-free with local Silero VAD neural network. Speak whenever you want — interrupt the assistant speech instantly with natural voice barge-in.",
  },
  {
    icon: Edit3,
    title: "Editable Voice Transcription",
    description:
      "Speech is transcribed straight into an editable input box. Easily review and correct typos or misheard words before sending for generation.",
  },
  {
    icon: CheckCircle,
    title: "Zero Clarification Friction",
    description:
      "No more answering 10 questions about edge cases. Speak2Build crawls your codebase directly, inspects existing types, and implements complete features autonomously.",
  },
  {
    icon: FileDiff,
    title: "Inline Unified Syntax Diffs",
    description:
      "Inspect syntax-highlighted additions and deletions directly inside chat. Accept single files or say 'apply all' to batch-apply changes cleanly.",
  },
  {
    icon: TerminalSquare,
    title: "Integrated Test Runner & Auto-Repair",
    description:
      "Run pytest, npm test, or cargo test directly from chat. If an assertion breaks, say 'fix it' to diagnose the stack trace and repair code chronologically.",
  },
  {
    icon: KeyRound,
    title: "Bring Your Own Provider & Model",
    description:
      "Use your own API keys for OpenAI (GPT-4o), OpenRouter (Claude 3.7), Groq, or run completely offline with local Ollama. Keys stay local in VS Code secrets.",
  },
  {
    icon: Compass,
    title: "Interactive First-Time Walkthrough",
    description:
      "Built-in 6-step interactive tour explains voice commands, settings, and diff review. Re-open anytime with the '?' button in the header bar.",
  },
  {
    icon: Zap,
    title: "Global Hotkey (Ctrl + Alt + Space)",
    description:
      "Summon Speak2Build anywhere in VS Code. Start voice recording or hands-free listening instantly without taking your hands off the keyboard.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 md:py-32 bg-black relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 border-b border-zinc-800/80 pb-8">
          <div>
            <div className="flex items-center gap-2 text-brand-beige font-mono text-xs uppercase tracking-widest mb-3">
              <span>Engineered for Flow</span>
              <span>•</span>
              <span>Developer-Centric Core</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-white">
              Built for Hands-Free Speed.
            </h2>
          </div>
          <p className="text-zinc-400 text-sm md:text-base max-w-md mt-4 md:mt-0 font-normal">
            Every feature is designed to keep you in flow state — eliminating manual copy-pasting, multi-window alt-tabbing, and repetitive typing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <div
                key={index}
                className="p-6 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-brand-brown/60 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5 group-hover:border-brand-beige transition-colors">
                    <Icon className="w-5 h-5 text-brand-sand group-hover:scale-110 transition-transform" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2 tracking-tight">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                    {feat.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

