"use client";

import { useState } from "react";
import { Sparkles, Terminal, ArrowRight, ShieldCheck, Cpu, Code2 } from "lucide-react";
import FadeContent from "./reactbits/FadeContent";

export function BottomCta() {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText("code --install-extension RudraParmar.speak2build");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="install" className="py-section hero-gradient relative overflow-hidden grain border-t border-black/5">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section text-center relative z-10">
        <FadeContent duration={0.6}>
          <div className="flex justify-center mb-6">
            <span className="tag-pill">Get Started Today</span>
          </div>

          {/* Editorial Serif Headline */}
          <h2 className="font-display text-4xl sm:text-6xl lg:text-7xl font-medium tracking-tight text-alma-teriyaki leading-[1.05] mb-6 max-w-3xl mx-auto">
            Code naturally,
            <br />
            <em className="text-alma-collard">build effortlessly.</em>
          </h2>

          <p className="text-base sm:text-lg text-alma-teriyaki/60 max-w-xl mx-auto mb-10 leading-relaxed">
            Available directly inside VS Code on Windows, macOS, and Linux.
            Bring your own API keys or run completely free with local Ollama models.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="https://marketplace.visualstudio.com/items?itemName=RudraParmar.speak2build"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-alma text-base px-8 py-3.5 w-full sm:w-auto justify-center"
            >
              <Sparkles className="w-4 h-4 text-alma-kiwi" />
              <span>Install for VS Code</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <button
              onClick={copyCommand}
              className="w-full sm:w-auto px-6 py-3.5 rounded-pill font-mono text-xs bg-alma-surface hover:bg-white text-alma-teriyaki border border-black/10 shadow-sm flex items-center justify-center gap-3 transition-all"
            >
              <Terminal className="w-4 h-4 text-alma-collard" />
              <span>code --install-extension RudraParmar.speak2build</span>
              <span className="px-2 py-0.5 rounded-full bg-alma-aioli text-[10px] text-alma-teriyaki/70 font-semibold">
                {copied ? "Copied ✓" : "Copy"}
              </span>
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs text-alma-teriyaki/50">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-alma-collard" />
              100% Local Voice VAD
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-alma-collard" />
              Zero Telemetry / Key Privacy
            </span>
            <span className="flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-alma-collard" />
              Open Source MIT
            </span>
          </div>
        </FadeContent>
      </div>
    </section>
  );
}
