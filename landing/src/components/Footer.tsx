import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-alma-aioli/60 border-t border-black/5 py-12 text-alma-teriyaki/70">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        {/* Main Footer Row (Left: Brand | Right: Links & Install in the exact same line) */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pb-8 border-b border-black/5 text-center lg:text-left">
          {/* Brand Info */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-full overflow-hidden shadow-sm shrink-0">
                <Image
                  src="/icon.png"
                  alt="Speak2Build Logo"
                  width={32}
                  height={32}
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-display font-semibold text-lg text-alma-teriyaki tracking-tight">
                Speak2Build
              </span>
            </div>
            <span className="hidden sm:inline text-black/15">|</span>
            <p className="text-xs text-alma-teriyaki/60 font-sans">
              Hands-free voice-first AI pair programmer for VS Code.
            </p>
          </div>

          {/* Quick Nav Links + Install Button in the SAME LINE */}
          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-xs font-medium">
            <a href="#features" className="hover:text-alma-collard transition-colors">
              Features
            </a>
            <a href="#simulator" className="hover:text-alma-collard transition-colors">
              Interactive Demo
            </a>
            <a href="#architecture" className="hover:text-alma-collard transition-colors">
              Pipeline
            </a>
            <a href="#compare" className="hover:text-alma-collard transition-colors">
              Comparison
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-alma-collard transition-colors inline-flex items-center gap-1"
            >
              GitHub <ArrowUpRight className="w-3 h-3" />
            </a>
            {/* Install Extension on the SAME line */}
            <a
              href="#install"
              className="px-4 py-2 rounded-pill bg-alma-surface border border-black/10 hover:border-black/20 text-xs font-medium text-alma-teriyaki shadow-sm transition-all hover:-translate-y-0.5 whitespace-nowrap ml-1 sm:ml-2"
            >
              Install Extension
            </a>
          </div>
        </div>

        {/* Bottom Credits & Verified Guarantees */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-alma-teriyaki/50 font-sans">
          <div>
            © {new Date().getFullYear()} Speak2Build. Open-source software released under the MIT License.
          </div>
          <div className="flex items-center gap-4">
            <span>Local Silero VAD</span>
            <span>•</span>
            <span>Bring Your Own Keys</span>
            <span>•</span>
            <span>Zero Telemetry</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
