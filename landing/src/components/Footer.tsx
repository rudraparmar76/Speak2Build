import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-alma-yogurt border-t border-black/5 py-16 text-xs text-alma-teriyaki/60">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Col */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[#f7f5ee] border border-black/10 shrink-0 shadow-sm">
                <Image
                  src="/logo.jpg"
                  alt="Speak2Build Logo"
                  fill
                  className="object-cover scale-[2.2] object-[50%_33%]"
                />
              </div>
              <span className="font-display font-semibold text-base text-alma-teriyaki tracking-tight">
                Speak2Build
              </span>
            </div>
            <p className="text-alma-teriyaki/60 text-xs leading-relaxed max-w-xs">
              Hands-free voice-first AI pair programmer for VS Code. Turn your ideas into code with local VAD and multi-LLM orchestration.
            </p>
          </div>

          {/* Links: Capabilities */}
          <div>
            <h4 className="text-alma-teriyaki font-semibold uppercase tracking-wider text-[11px] mb-3">
              Capabilities
            </h4>
            <ul className="space-y-2 text-alma-teriyaki/70">
              <li>
                <a href="#simulator" className="hover:text-alma-collard transition-colors">
                  Hands-Free Silero VAD
                </a>
              </li>
              <li>
                <a href="#simulator" className="hover:text-alma-collard transition-colors">
                  Editable Voice Transcripts
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-alma-collard transition-colors">
                  Autonomous Context Crawling
                </a>
              </li>
              <li>
                <a href="#simulator" className="hover:text-alma-collard transition-colors">
                  Pytest Self-Healing Loop
                </a>
              </li>
            </ul>
          </div>

          {/* Links: Resources */}
          <div>
            <h4 className="text-alma-teriyaki font-semibold uppercase tracking-wider text-[11px] mb-3">
              Resources
            </h4>
            <ul className="space-y-2 text-alma-teriyaki/70">
              <li>
                <a href="#install" className="hover:text-alma-collard transition-colors">
                  VS Code Marketplace
                </a>
              </li>
              <li>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-alma-collard transition-colors flex items-center gap-1"
                >
                  GitHub Repository <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a href="#architecture" className="hover:text-alma-collard transition-colors">
                  Architecture Overview
                </a>
              </li>
              <li>
                <a href="#compare" className="hover:text-alma-collard transition-colors">
                  Feature Comparison
                </a>
              </li>
            </ul>
          </div>

          {/* Status & Credits */}
          <div className="space-y-3">
            <h4 className="text-alma-teriyaki font-semibold uppercase tracking-wider text-[11px] mb-3">
              System Status
            </h4>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-alma-kiwi animate-pulse" />
              <span className="text-xs font-mono text-alma-teriyaki/80">
                Silero VAD v5 Engine Ready
              </span>
            </div>
            <div className="text-[11px] text-alma-muted pt-2 leading-relaxed">
              Compatible with VS Code 1.85+, Python 3.10+, and local Ollama / OpenRouter / Groq / OpenAI.
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-black/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-alma-muted">
          <div>© {new Date().getFullYear()} Speak2Build. Open-source software released under the MIT License.</div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hover:text-alma-teriyaki transition-colors">Privacy</a>
            <span>•</span>
            <a href="#install" className="hover:text-alma-teriyaki transition-colors">Install</a>
            <span>•</span>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-alma-teriyaki transition-colors">GitHub</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
