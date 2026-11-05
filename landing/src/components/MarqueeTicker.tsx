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
      <div className="flex w-max animate-marquee">
        {/* Repeating twice for seamless marquee loop */}
        {[...ITEMS, ...ITEMS].map((item, idx) => (
          <div key={idx} className="flex items-center gap-6 mx-5">
            <span className="text-xs md:text-sm font-medium tracking-wide text-alma-teriyaki/70 hover:text-alma-collard transition-colors cursor-default">
              {item}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-alma-kiwi" />
          </div>
        ))}
      </div>
    </div>
  );
}
