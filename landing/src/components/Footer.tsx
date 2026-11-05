import { Mic, ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-zinc-950 border-t border-zinc-900 py-16 text-xs text-zinc-500 font-mono">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Col */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-brand-brown/40 border border-brand-brown/60 flex items-center justify-center">
                <Mic className="w-3.5 h-3.5 text-brand-beige" />
              </div>
              <span className="font-bold text-sm text-white tracking-tight">Speak2Build</span>
            </div>
            <p className="text-zinc-400 font-sans text-xs leading-relaxed">
              Hands-free voice-first AI pair programmer for VS Code. Minimalist brutalist developer tooling.
            </p>
          </div>

          {/* Links: Features */}
          <div>
            <h4 className="text-zinc-300 font-bold uppercase tracking-wider mb-3">Capabilities</h4>
            <ul className="space-y-2 text-zinc-400">
              <li>
                <a href="#simulator" className="hover:text-white transition-colors">
                  Hands-Free Silero VAD
                </a>
              </li>
              <li>
                <a href="#simulator" className="hover:text-white transition-colors">
                  Editable Voice Drafts
                </a>
              </li>
              <li>
                <a href="#workers" className="hover:text-white transition-colors">
                  Autonomous Context Crawling
                </a>
              </li>
              <li>
                <a href="#workers" className="hover:text-white transition-colors">
                  Pytest Self-Healing Loop
                </a>
              </li>
            </ul>
          </div>

          {/* Links: Documentation */}
          <div>
            <h4 className="text-zinc-300 font-bold uppercase tracking-wider mb-3">Resources</h4>
            <ul className="space-y-2 text-zinc-400">
              <li>
                <a href="#install" className="hover:text-white transition-colors">
                  VS Code Marketplace
                </a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
                  GitHub Repository <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a href="#architecture" className="hover:text-white transition-colors">
                  Architecture & Safety
                </a>
              </li>
              <li>
                <a href="#comparison" className="hover:text-white transition-colors">
                  Copilot Comparison
                </a>
              </li>
            </ul>
          </div>

          {/* Stack & System Specs */}
          <div>
            <h4 className="text-zinc-300 font-bold uppercase tracking-wider mb-3">Runtime Specs</h4>
            <ul className="space-y-1.5 text-zinc-500 text-[11px]">
              <li>VAD Engine: Silero v5 ONNX</li>
              <li>Speech Engine: Whisper STT</li>
              <li>Synthesis: Fast Unified Diff</li>
              <li>Host Platform: VS Code API &amp; React</li>
              <li>Backend: FastAPI &amp; Pytest (157 tests passed)</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-zinc-600">
            © {new Date().getFullYear()} Speak2Build. Inspired by 11x Design System. MIT License.
          </p>

          <div className="flex items-center gap-6 text-[11px] text-zinc-500">
            <span>Windows • macOS • Linux</span>
            <span>•</span>
            <span>Open Source</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

