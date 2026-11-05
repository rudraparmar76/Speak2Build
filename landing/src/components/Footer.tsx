import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-alma-aioli/60 border-t border-black/5 py-14 text-alma-teriyaki/70">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        {/* Main Footer Row */}
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 pb-10 border-b border-black/5 text-center md:text-left">
          {/* Brand Info */}
          <div className="space-y-2 max-w-sm">
            <div className="flex items-center justify-center md:justify-start gap-2.5">
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
            <p className="text-xs text-alma-teriyaki/60 leading-relaxed font-sans">
              Hands-free voice-first AI pair programmer for Visual Studio Code.
              Turn your ideas into production-ready code.
            </p>
          </div>

          {/* Quick Nav Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium">
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
          </div>

          {/* Install Pill CTA */}
          <div className="flex items-center gap-3">
            <a
              href="#install"
              className="px-4 py-2 rounded-pill bg-alma-surface border border-black/10 hover:border-black/20 text-xs font-medium text-alma-teriyaki shadow-sm transition-all hover:-translate-y-0.5"
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
