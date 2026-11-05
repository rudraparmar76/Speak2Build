"use client";

import { useState } from "react";
import { Mic, Sparkles, ArrowRight, CheckCircle2, ShieldCheck, Zap, Layers } from "lucide-react";

export function Hero() {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText("code --install-extension speak2build");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-grid-pattern">
      {/* Glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-brand-brown/15 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-brand-accent/10 blur-[90px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        {/* Top Announcement Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-brand-brown/30 text-xs text-brand-sand backdrop-blur-md mb-8 hover:border-brand-brown/60 transition-colors cursor-default">
          <span className="flex h-2 w-2 rounded-full bg-brand-lightBrown animate-ping" />
          <span className="font-mono text-zinc-400">Speak2Build 2.0</span>
          <span className="text-zinc-600">•</span>
          <span className="text-brand-lightBrown font-medium">Hands-Free AI Pair Programmer</span>
          <ArrowRight className="w-3.5 h-3.5 text-brand-beige" />
        </div>

        {/* 11x Brutalist Main Headline */}
        <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-tighter uppercase text-white leading-[0.88] max-w-6xl mb-8">
          Code at the <br className="hidden sm:inline" />
          <span className="text-metallic">Speed of Speech.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl md:text-2xl text-zinc-400 max-w-3xl leading-relaxed font-normal mb-10">
          The first hands-free voice AI for VS Code. Powered by real-time{" "}
          <span className="text-zinc-200 font-medium">Silero VAD</span>, autonomous workspace context crawling, unified{" "}
          <span className="text-zinc-200 font-medium">syntax diffs</span>, and an automatic self-healing{" "}
          <span className="text-brand-lightBrown font-medium">pytest runner</span>.
        </p>

        {/* Action CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mb-14">
          <a
            href="#install"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-brown via-brand-accent to-brand-brown hover:brightness-110 text-white border border-brand-sand/30 shadow-xl shadow-brand-brown/20 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-0.5"
          >
            <Sparkles className="w-4 h-4 text-brand-sand" />
            <span>Install Extension for Free</span>
            <ArrowRight className="w-4 h-4 text-brand-sand" />
          </a>

          <a
            href="#simulator"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-medium text-sm bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 flex items-center justify-center gap-2.5 transition-all"
          >
            <Mic className="w-4 h-4 text-brand-beige" />
            <span>Try Interactive Simulator</span>
          </a>
        </div>

        {/* CLI Quick Copy Bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 backdrop-blur-sm text-xs font-mono text-zinc-400 mb-16 shadow-inner">
          <span className="text-zinc-500">$</span>
          <span className="text-zinc-200 select-all">code --install-extension speak2build</span>
          <button
            onClick={copyCommand}
            className="ml-2 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>

        {/* 4 Feature Badge Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl pt-8 border-t border-zinc-800/80">
          <div className="flex flex-col items-center sm:items-start p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
            <div className="flex items-center gap-2 text-brand-beige mb-1 font-mono text-xs uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" />
              <span>Low Latency</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">48ms VAD</span>
            <span className="text-xs text-zinc-500 mt-1">Real-time Silero voice gate</span>
          </div>

          <div className="flex flex-col items-center sm:items-start p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
            <div className="flex items-center gap-2 text-brand-sand mb-1 font-mono text-xs uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5" />
              <span>Zero Friction</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">0 Q&A Prompts</span>
            <span className="text-xs text-zinc-500 mt-1">Crawls code autonomously</span>
          </div>

          <div className="flex flex-col items-center sm:items-start p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
            <div className="flex items-center gap-2 text-emerald-400 mb-1 font-mono text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Self-Healing</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">Auto-Repair</span>
            <span className="text-xs text-zinc-500 mt-1">Runs pytest & heals failures</span>
          </div>

          <div className="flex flex-col items-center sm:items-start p-4 rounded-lg bg-zinc-950/50 border border-zinc-800/50">
            <div className="flex items-center gap-2 text-brand-lightBrown mb-1 font-mono text-xs uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Privacy First</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">BYO LLM</span>
            <span className="text-xs text-zinc-500 mt-1">OpenAI, Groq, or Local Ollama</span>
          </div>
        </div>
      </div>
    </section>
  );
}

