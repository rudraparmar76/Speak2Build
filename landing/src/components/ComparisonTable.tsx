"use client";

import { Check, X } from "lucide-react";

const COMPARISONS = [
  {
    feature: "Hands-Free Always-Listening (Silero VAD)",
    speak2build: true,
    copilot: false,
    chatbots: false,
  },
  {
    feature: "Live Voice Barge-In (Interrupt AI Speaking)",
    speak2build: true,
    copilot: false,
    chatbots: false,
  },
  {
    feature: "Editable Speech Transcription before Generation",
    speak2build: true,
    copilot: false,
    chatbots: false,
  },
  {
    feature: "Autonomous Workspace Context Crawling (Zero Q&A)",
    speak2build: true,
    copilot: "partial",
    chatbots: false,
  },
  {
    feature: "Inline Syntax Diffs with Line-by-Line Review",
    speak2build: true,
    copilot: "partial",
    chatbots: false,
  },
  {
    feature: "Integrated Pytest Runner inside Chat",
    speak2build: true,
    copilot: false,
    chatbots: false,
  },
  {
    feature: "One-Click / Spoken Auto-Repair for Failing Tests",
    speak2build: true,
    copilot: false,
    chatbots: false,
  },
  {
    feature: "Bring Your Own Key (OpenAI, Groq, Ollama Offline)",
    speak2build: true,
    copilot: false,
    chatbots: false,
  },
  {
    feature: "Zero Copy-Pasting Friction",
    speak2build: true,
    copilot: "partial",
    chatbots: false,
  },
];

export function ComparisonTable() {
  return (
    <section id="comparison" className="py-24 md:py-32 bg-black relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 border-b border-zinc-800/80 pb-8">
          <div>
            <div className="flex items-center gap-2 text-brand-beige font-mono text-xs uppercase tracking-widest mb-3">
              <span>Why Speak2Build</span>
              <span>•</span>
              <span>Direct Comparison</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-white">
              The Evolution of Pair Programming.
            </h2>
          </div>
          <p className="text-zinc-400 text-sm md:text-base max-w-md mt-4 md:mt-0 font-normal">
            Traditional tools force you to type, read walls of code, and manually run tests. Speak2Build automates the full engineering feedback loop.
          </p>
        </div>

        {/* Table Container */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-xs text-zinc-400">
                  <th className="py-4 px-6 font-semibold uppercase tracking-wider text-zinc-300">
                    Capability
                  </th>
                  <th className="py-4 px-6 font-semibold uppercase tracking-wider text-brand-beige bg-brand-brown/10 border-x border-brand-brown/30">
                    Speak2Build 2.0
                  </th>
                  <th className="py-4 px-6 font-semibold uppercase tracking-wider text-zinc-400">
                    Standard Copilots
                  </th>
                  <th className="py-4 px-6 font-semibold uppercase tracking-wider text-zinc-400">
                    Web Chatbots (GPT/Claude)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-xs">
                {COMPARISONS.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3.5 px-6 font-medium text-zinc-200">
                      {row.feature}
                    </td>

                    {/* Speak2Build */}
                    <td className="py-3.5 px-6 bg-brand-brown/5 border-x border-brand-brown/20">
                      {row.speak2build === true && (
                        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold font-mono">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>Native</span>
                        </div>
                      )}
                    </td>

                    {/* Copilot */}
                    <td className="py-3.5 px-6 text-zinc-400">
                      {row.copilot === true && <Check className="w-4 h-4 text-emerald-400" />}
                      {row.copilot === false && <X className="w-4 h-4 text-zinc-600" />}
                      {row.copilot === "partial" && (
                        <span className="font-mono text-zinc-500">Partial / Clicky</span>
                      )}
                    </td>

                    {/* Web Chatbots */}
                    <td className="py-3.5 px-6 text-zinc-400">
                      {row.chatbots === true && <Check className="w-4 h-4 text-emerald-400" />}
                      {row.chatbots === false && <X className="w-4 h-4 text-zinc-600" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

