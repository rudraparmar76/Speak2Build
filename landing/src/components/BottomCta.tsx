"use client";

import { useState } from "react";
import { Sparkles, Terminal, ArrowRight } from "lucide-react";

export function BottomCta() {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText("code --install-extension speak2build");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="install" className="py-24 md:py-36 bg-black border-t border-zinc-900 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-radial-gradient from-brand-accent/20 to-transparent blur-3xl opacity-30 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <span className="text-xs font-mono uppercase tracking-widest text-brand-beige mb-6 inline-block">
          Install Speak2Build for Visual Studio Code
        </span>

        {/* Monumental Headline */}
        <h2 className="text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-tighter text-white leading-none mb-8">
          Stop Typing. <br />
          <span className="text-metallic">Start Building.</span>
        </h2>

        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Available for VS Code on Windows, macOS, and Linux. Bring your own keys or connect to local Ollama.
          Always free and open-source.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <a
            href="https://marketplace.visualstudio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-brown via-brand-accent to-brand-brown hover:brightness-110 text-white border border-brand-sand/30 shadow-xl shadow-brand-brown/25 flex items-center justify-center gap-3 transition-all"
          >
            <Sparkles className="w-4 h-4 text-brand-sand" />
            <span>Install from VS Code Marketplace</span>
            <ArrowRight className="w-4 h-4 text-brand-sand" />
          </a>

          <button
            onClick={copyCommand}
            className="w-full sm:w-auto px-6 py-4 rounded-xl font-mono text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 flex items-center justify-center gap-3 transition-all"
          >
            <Terminal className="w-4 h-4 text-brand-beige" />
            <span>code --install-extension speak2build</span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400">
              {copied ? "Copied ✓" : "Copy"}
            </span>
          </button>
        </div>

        {/* Shortcuts Pill */}
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-400">
          <span>Keyboard Trigger:</span>
          <kbd className="px-2 py-0.5 rounded bg-zinc-900 text-brand-beige border border-zinc-700">
            Ctrl + Alt + Space
          </kbd>
          <span>•</span>
          <span>Hands-Free Mic:</span>
          <kbd className="px-2 py-0.5 rounded bg-zinc-900 text-brand-beige border border-zinc-700">
            Silero VAD
          </kbd>
        </div>
      </div>
    </section>
  );
}

