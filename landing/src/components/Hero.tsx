"use client";

import { useState } from "react";
import Image from "next/image";
import { Mic, ArrowRight, CheckCircle2, ShieldCheck, Zap, Layers } from "lucide-react";
import BlurText from "./reactbits/BlurText";
import CountUp from "./reactbits/CountUp";
import FadeContent from "./reactbits/FadeContent";

const STATS = [
  { value: 20000, suffix: "+", label: "voice commands", prefix: "" },
  { value: 4.8, suffix: "", label: "avg rating", prefix: "★ ", decimals: 1 },
  { value: 95, suffix: "%", label: "hands-free", prefix: "" },
];

const TRUST_BADGES = [
  { icon: CheckCircle2, text: "Open Source" },
  { icon: ShieldCheck, text: "Privacy First" },
  { icon: Zap, text: "Real-time VAD" },
  { icon: Layers, text: "Multi-LLM" },
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
        {/* Official Brand Logo Badge */}
        <FadeContent delay={0} duration={0.6}>
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="relative w-48 sm:w-60 h-28 sm:h-36 rounded-2xl overflow-hidden shadow-sm border border-black/5 bg-[#f7f5ee] p-2 hover:shadow-md transition-all">
              <Image
                src="/logo.jpg"
                alt="Speak2Build - Turn your ideas into code"
                fill
                className="object-contain"
                priority
              />
            </div>
            <span className="tag-pill flex items-center gap-1.5 mt-4">
              <Mic size={12} />
              Hands-Free VS Code Extension
            </span>
          </div>
        </FadeContent>

        {/* Main Headline */}
        <div className="text-center max-w-3xl mx-auto mb-6">
          <BlurText
            text="The voice-first AI pair programmer that fits in your editor."
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1] tracking-tight text-alma-teriyaki"
            animateBy="words"
            delay={80}
            stepDuration={0.5}
            direction="bottom"
          />
        </div>

        {/* Subtitle */}
        <FadeContent delay={0.4} duration={0.8} blur={4}>
          <p className="text-center text-lg sm:text-xl text-alma-teriyaki/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Speak naturally, code effortlessly. Real-time voice detection, autonomous
            context crawling, inline diffs, and self-healing test repair — all
            hands-free.
          </p>
        </FadeContent>

        {/* CTA Buttons */}
        <FadeContent delay={0.6} duration={0.7}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button onClick={copyCommand} className="btn-alma text-base px-8 py-3.5">
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
              href="https://github.com/speak2build"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-alma-teriyaki/60 hover:text-alma-teriyaki transition-colors flex items-center gap-1.5 px-5 py-3 rounded-pill border border-black/8 hover:border-black/15 bg-white/50"
            >
              View on GitHub
              <ArrowRight size={14} />
            </a>
          </div>
        </FadeContent>

        {/* Floating UI Cards around a central "editor" mock */}
        <FadeContent delay={0.8} duration={1}>
          <div className="relative max-w-3xl mx-auto">
            {/* Central Editor Mock */}
            <div className="card-alma rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-alma-teriyaki/95 px-4 py-2.5 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <div className="w-3 h-3 rounded-full bg-green-400/80" />
                </div>
                <span className="text-xs text-white/50 font-mono ml-2">
                  app.py — Speak2Build
                </span>
              </div>
              <div className="bg-[#1e1e1e] p-5 font-mono text-sm leading-relaxed">
                <div className="text-green-400/80 mb-1">
                  # 🎙️ Voice command detected
                </div>
                <div className="text-white/40 mb-3">
                  &quot;Add a REST endpoint for user authentication&quot;
                </div>
                <div className="text-blue-400">
                  <span className="text-purple-400">from</span> flask{" "}
                  <span className="text-purple-400">import</span> Flask, request, jsonify
                </div>
                <div className="text-blue-400 mt-1">
                  <span className="text-purple-400">from</span> auth{" "}
                  <span className="text-purple-400">import</span> verify_token
                </div>
                <div className="mt-3">
                  <span className="text-blue-400">@app</span>
                  <span className="text-yellow-300">.route</span>
                  <span className="text-white/80">(</span>
                  <span className="text-green-300">&apos;/api/auth&apos;</span>
                  <span className="text-white/80">, methods=[</span>
                  <span className="text-green-300">&apos;POST&apos;</span>
                  <span className="text-white/80">])</span>
                </div>
                <div>
                  <span className="text-purple-400">def</span>{" "}
                  <span className="text-yellow-300">authenticate</span>
                  <span className="text-white/80">():</span>
                </div>
                <div className="text-white/40 ml-8">
                  token = request.json.get(<span className="text-green-300">&apos;token&apos;</span>)
                </div>
                <div className="text-white/40 ml-8">
                  <span className="text-purple-400">return</span> jsonify(verify_token(token))
                </div>
              </div>
            </div>

            {/* Floating Card: Voice Active */}
            <div className="absolute -left-4 lg:-left-16 top-8 animate-float">
              <div className="card-alma rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
                <div className="w-8 h-8 rounded-full bg-alma-kiwi/20 flex items-center justify-center">
                  <Mic size={14} className="text-alma-collard" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-alma-teriyaki">
                    Listening...
                  </div>
                  <div className="text-[10px] text-alma-muted">Silero VAD active</div>
                </div>
                <div className="w-2 h-2 rounded-full bg-alma-kiwi animate-pulse" />
              </div>
            </div>

            {/* Floating Card: Context Crawled */}
            <div className="absolute -right-4 lg:-right-16 top-20 animate-float-delayed">
              <div className="card-alma rounded-2xl px-4 py-3 shadow-lg">
                <div className="text-xs font-semibold text-alma-teriyaki mb-1">
                  Context Crawled
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {["app.py", "auth.py", "models.py"].map((f) => (
                    <span key={f} className="text-[10px] px-2 py-0.5 bg-alma-aioli rounded-full text-alma-teriyaki/70 font-mono">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating Card: Tests Passing */}
            <div className="absolute -left-2 lg:-left-12 bottom-4 animate-float-slow">
              <div className="card-alma rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg">
                <CheckCircle2 size={16} className="text-alma-kiwi" />
                <div>
                  <div className="text-xs font-semibold text-alma-collard">
                    Tests Passing
                  </div>
                  <div className="text-[10px] text-alma-muted">12/12 passed</div>
                </div>
              </div>
            </div>
          </div>
        </FadeContent>

        {/* Stats Strip */}
        <FadeContent delay={1} duration={0.8}>
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16 mt-16 mb-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display text-3xl sm:text-4xl font-semibold text-alma-teriyaki">
                  <CountUp
                    to={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.decimals || 0}
                    duration={2.5}
                    separator=","
                  />
                </div>
                <div className="text-sm text-alma-muted mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </FadeContent>

        {/* Trust Badges */}
        <FadeContent delay={1.2} duration={0.6}>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {TRUST_BADGES.map((badge) => (
              <div
                key={badge.text}
                className="flex items-center gap-1.5 text-sm text-alma-teriyaki/50"
              >
                <badge.icon size={14} />
                {badge.text}
              </div>
            ))}
          </div>
        </FadeContent>
      </div>
    </section>
  );
}
