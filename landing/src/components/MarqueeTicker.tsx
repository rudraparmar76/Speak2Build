"use client";

const ITEMS = [
  "Hands-Free Coding",
  "Silero VAD v5",
  "Autonomous Context Crawling",
  "Inline Unified Diffs",
  "Self-Healing Pytest Loop",
  "Real-Time Whisper STT",
  "FastAPI & Flask Support",
  "React & TypeScript",
  "Voice Barge-In",
  "Local Ollama & Open Models",
  "Groq Ultra-Fast Inference",
  "OpenAI & Claude Compatible",
];

export function MarqueeTicker() {
  return (
    <div className="relative w-full py-4 bg-alma-aioli/80 border-y border-black/5 overflow-hidden select-none">
      {/* Soft gradient edge masks */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-r from-alma-aioli/95 to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-l from-alma-aioli/95 to-transparent z-10" />

      {/* Animated strip moving Right to Left */}
      <div className="flex w-max animate-marquee-rtl">
        {[...ITEMS, ...ITEMS, ...ITEMS, ...ITEMS].map((item, idx) => (
          <div key={idx} className="flex items-center gap-6 mx-5">
            <span className="text-xs md:text-sm font-medium tracking-wide text-alma-teriyaki/70 hover:text-alma-collard transition-colors cursor-default whitespace-nowrap">
              {item}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-alma-kiwi shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
