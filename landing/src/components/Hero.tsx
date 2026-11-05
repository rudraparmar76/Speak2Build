"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Mic,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Layers,
  Cpu,
  FileCode,
} from "lucide-react";
import BlurText from "./reactbits/BlurText";
import CountUp from "./reactbits/CountUp";
import FadeContent from "./reactbits/FadeContent";

// Genuine, verified technical specifications (no fake claims)
const TECH_SPECS = [
  { value: 200, prefix: "< ", suffix: "ms", label: "Voice VAD Latency" },
  { value: 100, prefix: "", suffix: "%", label: "Local Key & Audio Privacy" },
  { value: 157, prefix: "", suffix: "+", label: "Workspace Tests Passing" },
  { value: 0, prefix: "", suffix: "", label: "Cloud Audio Stored" },
];

const TRUST_BADGES = [
  { icon: CheckCircle2, text: "Open Source MIT" },
  { icon: ShieldCheck, text: "100% Local Voice VAD" },
  { icon: Zap, text: "Instant Speech Detection" },
  { icon: Layers, text: "OpenAI, Claude, Ollama, Groq" },
];

export function Hero() {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText("code --install-extension speak2build");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="hero-gradient relative overflow-hidden grain">
      <div className="relative z-10 max-w-content mx-auto px-section-mobile lg:px-section pt-28 pb-16">
        {/* Brand Emblem */}
        <FadeContent delay={0} duration={0.6}>
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden shadow-md border-2 border-alma-collard/20 bg-alma-surface p-1 hover:scale-105 transition-transform">
              <Image
                src="/icon.png"
                alt="Speak2Build - Turn your ideas into code"
                width={96}
                height={96}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <span className="tag-pill flex items-center gap-1.5 mt-4">
              <Mic size={12} />
              Turn your ideas into code
            </span>
          </div>
        </FadeContent>

        {/* Main Headline */}
        <div className="text-center max-w-3xl mx-auto mb-6">
          <BlurText
            text="The voice-first AI pair programmer that fits in your editor."
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.05] tracking-tight text-alma-teriyaki"
            animateBy="words"
            delay={70}
            stepDuration={0.45}
            direction="bottom"
          />
        </div>

        {/* Subtitle */}
        <FadeContent delay={0.3} duration={0.8} blur={4}>
          <p className="text-center text-lg sm:text-xl text-alma-teriyaki/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Speak naturally, code effortlessly. Real-time voice activity detection,
            autonomous codebase indexing, inline unified diffs, and self-healing test repair.
          </p>
        </FadeContent>

        {/* CTA Buttons */}
        <FadeContent delay={0.5} duration={0.7}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={copyCommand}
              className="btn-alma text-base px-8 py-3.5"
            >
              {copied ? (
                <>✓ Copied to clipboard</>
              ) : (
                <>
                  Install for VS Code
                  <ArrowRight size={16} />
                </>
              )}
            </button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-alma-teriyaki/70 hover:text-alma-teriyaki transition-colors flex items-center gap-1.5 px-5 py-3 rounded-pill border border-black/10 hover:border-black/20 bg-alma-surface shadow-sm"
            >
              View on GitHub
              <ArrowRight size={14} />
            </a>
          </div>
        </FadeContent>

        {/* Interactive Editor Window with Responsive Floating Pills */}
        <FadeContent delay={0.7} duration={0.9}>
          <div className="relative max-w-4xl mx-auto">
            {/* Desktop-Only Floating Pill Cards (positioned in outer margins, never covering code) */}
            <div className="hidden xl:block absolute -left-20 top-12 z-20 animate-float">
              <div className="card-alma px-4 py-3 flex items-center gap-3 shadow-lg border border-black/5 bg-alma-surface/95 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-full bg-alma-kiwi/20 flex items-center justify-center">
                  <Mic size={15} className="text-alma-collard" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-alma-teriyaki">
                    Silero VAD Active
                  </div>
                  <div className="text-[10px] text-alma-muted">Sub-200ms voice capture</div>
                </div>
                <div className="w-2 h-2 rounded-full bg-alma-kiwi animate-pulse" />
              </div>
            </div>

            <div className="hidden xl:block absolute -right-20 top-24 z-20 animate-float-delayed">
              <div className="card-alma px-4 py-3 shadow-lg border border-black/5 bg-alma-surface/95 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <Cpu size={14} className="text-alma-teal" />
                  <span className="text-xs font-semibold text-alma-teriyaki">
                    Context Indexed
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {["app.py", "auth.py", "db.py"].map((f) => (
                    <span
                      key={f}
                      className="text-[10px] px-2 py-0.5 bg-alma-aioli rounded-md text-alma-teriyaki/70 font-mono"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="hidden xl:block absolute -left-14 -bottom-6 z-20 animate-float-slow">
              <div className="card-alma px-4 py-3 flex items-center gap-2.5 shadow-lg border border-black/5 bg-alma-surface/95 backdrop-blur-sm">
                <CheckCircle2 size={16} className="text-alma-collard" />
                <div>
                  <div className="text-xs font-semibold text-alma-teriyaki">
                    Self-Healing Tests
                  </div>
                  <div className="text-[10px] text-alma-muted">157 passed · Exit Code 0</div>
                </div>
              </div>
            </div>

            {/* Central Window Frame */}
            <div className="rounded-3xl border border-black/10 bg-[#161614] shadow-2xl overflow-hidden">
              {/* Window Titlebar */}
              <div className="bg-[#20201d] px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block" />
                  <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block" />
                  <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block" />
                  <div className="ml-3 flex items-center gap-2 text-xs font-mono text-white/50">
                    <FileCode size={13} className="text-alma-kiwi" />
                    <span className="text-white/80 font-medium">services/auth.py</span>
                    <span className="text-white/20">—</span>
                    <span>Speak2Build</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-alma-collard/50 text-alma-kiwi border border-alma-kiwi/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-alma-kiwi animate-pulse" />
                    Listening
                  </span>
                </div>
              </div>

              {/* Code Display Area */}
              <div className="p-6 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto bg-[#121210]">
                {/* Spoken voice intent display */}
                <div className="mb-4 pb-3 border-b border-white/5 flex items-start gap-3 text-white/70">
                  <span className="text-alma-kiwi">🎙️</span>
                  <div>
                    <span className="text-white/40 text-xs">Spoken voice prompt:</span>
                    <p className="text-alma-kiwi text-xs sm:text-sm font-sans italic mt-0.5">
                      &quot;Add a JWT authentication route with token expiration and validation.&quot;
                    </p>
                  </div>
                </div>

                {/* Syntax-highlighted code with clean diffs */}
                <div className="space-y-1">
                  <div className="text-white/40">
                    <span className="text-purple-400">from</span> datetime{" "}
                    <span className="text-purple-400">import</span> datetime, timedelta
                  </div>
                  <div className="text-white/40">
                    <span className="text-purple-400">from</span> fastapi{" "}
                    <span className="text-purple-400">import</span> APIRouter, HTTPException, Depends
                  </div>
                  <div className="text-white/40">
                    <span className="text-purple-400">import</span> jwt
                  </div>

                  <div className="pt-2 text-white/30"># Generated inline unified diff</div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-6 px-6 py-0.5 border-l-2 border-emerald-400">
                    <span className="text-emerald-500 font-bold mr-2">+</span>
                    <span className="text-blue-400">router</span> = APIRouter(prefix=
                    <span className="text-green-300">&quot;/auth&quot;</span>, tags=[
                    <span className="text-green-300">&quot;auth&quot;</span>])
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-6 px-6 py-0.5 border-l-2 border-emerald-400">
                    <span className="text-emerald-500 font-bold mr-2">+</span>
                    <span className="text-blue-400">@router</span>.post(
                    <span className="text-green-300">&quot;/login&quot;</span>)
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-6 px-6 py-0.5 border-l-2 border-emerald-400">
                    <span className="text-emerald-500 font-bold mr-2">+</span>
                    <span className="text-purple-400">async def</span>{" "}
                    <span className="text-yellow-300">login</span>(payload: UserCredentials):
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-6 px-6 py-0.5 border-l-2 border-emerald-400">
                    <span className="text-emerald-500 font-bold mr-2">+</span>
                    {"    "}token = create_access_token(payload.user_id, expires_delta=timedelta(hours=8))
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-6 px-6 py-0.5 border-l-2 border-emerald-400">
                    <span className="text-emerald-500 font-bold mr-2">+</span>
                    {"    "}
                    <span className="text-purple-400">return</span> &#123;
                    <span className="text-green-300">&quot;access_token&quot;</span>: token,{" "}
                    <span className="text-green-300">&quot;token_type&quot;</span>:{" "}
                    <span className="text-green-300">&quot;bearer&quot;</span>&#125;
                  </div>
                </div>

                {/* Bottom Editor Action Strip */}
                <div className="mt-5 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-white/50">
                    <span className="text-alma-kiwi font-bold">✓</span>
                    <span>1 file changed (+6 lines)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-alma-collard text-white text-[11px] font-sans font-medium">
                      Say &quot;apply diff&quot;
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white/5 text-white/50 text-[11px] font-sans">
                      Say &quot;reject&quot;
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile/Tablet Feature Pills (Clean row beneath editor, no overlapping!) */}
            <div className="xl:hidden grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="card-alma px-3.5 py-2.5 flex items-center gap-2.5">
                <Mic size={14} className="text-alma-collard shrink-0" />
                <span className="text-xs font-medium text-alma-teriyaki">
                  Silero VAD Sub-200ms
                </span>
              </div>
              <div className="card-alma px-3.5 py-2.5 flex items-center gap-2.5">
                <Cpu size={14} className="text-alma-teal shrink-0" />
                <span className="text-xs font-medium text-alma-teriyaki">
                  Autonomous Context Index
                </span>
              </div>
              <div className="card-alma px-3.5 py-2.5 flex items-center gap-2.5">
                <CheckCircle2 size={14} className="text-alma-collard shrink-0" />
                <span className="text-xs font-medium text-alma-teriyaki">
                  Self-Healing Pytest Loop
                </span>
              </div>
            </div>
          </div>
        </FadeContent>

        {/* Real Technical Specifications (No Fake Claims) */}
        <FadeContent delay={0.9} duration={0.8}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-3xl mx-auto mt-20 mb-10">
            {TECH_SPECS.map((spec) => (
              <div key={spec.label} className="text-center">
                <div className="font-display text-3xl sm:text-4xl font-semibold text-alma-teriyaki">
                  {spec.prefix}
                  <CountUp
                    to={spec.value}
                    suffix={spec.suffix}
                    duration={2}
                    separator=","
                  />
                </div>
                <div className="text-xs sm:text-sm text-alma-teriyaki/60 mt-1.5 font-medium">
                  {spec.label}
                </div>
              </div>
            ))}
          </div>
        </FadeContent>

        {/* Trust Badges */}
        <FadeContent delay={1.1} duration={0.6}>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 pt-2">
            {TRUST_BADGES.map((badge) => (
              <div
                key={badge.text}
                className="flex items-center gap-1.5 text-xs sm:text-sm text-alma-teriyaki/60"
              >
                <badge.icon size={14} className="text-alma-collard" />
                {badge.text}
              </div>
            ))}
          </div>
        </FadeContent>
      </div>
    </section>
  );
}
