"use client";

import { Check, X } from "lucide-react";
import FadeContent from "./reactbits/FadeContent";

const FEATURES_LIST = [
  { feature: "Voice-first interaction", speak2build: true, copilot: false, chatbots: false },
  { feature: "Real-time VAD (no wake word)", speak2build: true, copilot: false, chatbots: false },
  { feature: "Autonomous context crawling", speak2build: true, copilot: "partial", chatbots: false },
  { feature: "Inline unified diffs", speak2build: true, copilot: true, chatbots: false },
  { feature: "Auto test runner", speak2build: true, copilot: false, chatbots: false },
  { feature: "Self-healing test repair", speak2build: true, copilot: false, chatbots: false },
  { feature: "Multi-LLM support", speak2build: true, copilot: false, chatbots: "partial" },
  { feature: "Local / self-hosted LLMs", speak2build: true, copilot: false, chatbots: "partial" },
  { feature: "TTS feedback", speak2build: true, copilot: false, chatbots: false },
  { feature: "Open source", speak2build: true, copilot: false, chatbots: "partial" },
];

function CellValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="w-6 h-6 rounded-full bg-alma-kiwi/20 flex items-center justify-center">
        <Check size={14} className="text-alma-collard" />
      </div>
    );
  }
  if (value === "partial") {
    return (
      <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
        <span className="text-yellow-600 text-xs font-bold">~</span>
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center">
      <X size={12} className="text-alma-muted" />
    </div>
  );
}

export function ComparisonTable() {
  return (
    <section id="compare" className="py-section bg-alma-yogurt relative">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        <FadeContent duration={0.7}>
          <div className="text-center mb-12">
            <span className="tag-pill mb-4 inline-block">Compare</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium leading-[0.96] tracking-tight mt-4">
              Not just another
              <br />
              <em className="text-alma-collard">code assistant.</em>
            </h2>
          </div>
        </FadeContent>

        <FadeContent delay={0.2} duration={0.7}>
          <div className="card-alma overflow-hidden max-w-3xl mx-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="text-left p-4 text-alma-teriyaki/40 font-medium">
                      Feature
                    </th>
                    <th className="text-center p-4 font-semibold text-alma-collard">
                      Speak2Build
                    </th>
                    <th className="text-center p-4 text-alma-teriyaki/40 font-medium">
                      Copilot
                    </th>
                    <th className="text-center p-4 text-alma-teriyaki/40 font-medium">
                      AI Chatbots
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES_LIST.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-black/3 ${
                        i % 2 === 0 ? "bg-alma-aioli/30" : ""
                      }`}
                    >
                      <td className="p-4 text-alma-teriyaki/70">{row.feature}</td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <CellValue value={row.speak2build} />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <CellValue value={row.copilot} />
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-center">
                          <CellValue value={row.chatbots} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FadeContent>
      </div>
    </section>
  );
}
