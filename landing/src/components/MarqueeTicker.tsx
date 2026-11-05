"use client";

const ITEMS = [
  "HANDS-FREE CODING",
  "SILERO VAD v5",
  "ZERO CLARIFICATIONS",
  "AUTONOMOUS AST CRAWLER",
  "INLINE SYNTAX DIFFS",
  "PYTEST HEALER",
  "WHISPER STT",
  "FASTAPI & FLASK",
  "REACT & TYPESCRIPT",
  "VOICE BARGE-IN",
  "LOCAL OLLAMA",
  "GROQ ULTRA-FAST",
  "OPENAI GPT-4o",
  "ANTHROPIC CLAUDE",
];

export function MarqueeTicker() {
  return (
    <div className="relative w-full py-4 bg-zinc-950 border-y border-zinc-800/80 overflow-hidden select-none">
      <div className="flex w-max animate-marquee">
        {/* Repeating twice for continuous loop */}
        {[...ITEMS, ...ITEMS].map((item, idx) => (
          <div key={idx} className="flex items-center gap-6 mx-6">
            <span className="font-mono text-xs md:text-sm font-semibold tracking-widest text-zinc-400 uppercase hover:text-brand-lightBrown transition-colors cursor-default">
              {item}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-brand-brown/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

