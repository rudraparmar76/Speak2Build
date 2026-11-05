"use client";

import { useState, useEffect } from "react";
import { Mic, Terminal, Sparkles, Menu, X } from "lucide-react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const copyInstallCommand = () => {
    navigator.clipboard.writeText("code --install-extension speak2build");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-black/90 backdrop-blur-md border-b border-white/10 py-3"
          : "bg-transparent border-b border-white/5 py-4"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-brown via-brand-accent to-black border border-brand-brown/40 flex items-center justify-center shadow-lg group-hover:border-brand-beige transition-colors">
              <Mic className="w-5 h-5 text-brand-sand group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
                Speak2Build
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-brand-brown/30 text-brand-beige border border-brand-brown/50">
                  v2.0
                </span>
              </span>
            </div>
          </a>

          {/* Status pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Silero VAD Active
          </div>
        </div>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-300">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#workers" className="hover:text-white transition-colors">
            Digital Workers
          </a>
          <a href="#simulator" className="hover:text-white transition-colors">
            Interactive IDE
          </a>
          <a href="#architecture" className="hover:text-white transition-colors">
            Architecture
          </a>
          <a href="#comparison" className="hover:text-white transition-colors">
            Comparison
          </a>
        </nav>

        {/* CTA & Actions */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={copyInstallCommand}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono bg-zinc-900 border border-zinc-700/80 hover:border-brand-brown text-zinc-300 hover:text-white transition-all"
            title="Click to copy install command"
          >
            <Terminal className="w-3.5 h-3.5 text-brand-beige" />
            <span>{copied ? "Copied!" : "code --install speak2build"}</span>
          </button>

          <a
            href="#install"
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold bg-gradient-to-r from-brand-brown to-brand-accent hover:from-brand-accent hover:to-brand-brown text-white border border-brand-sand/30 shadow-sm transition-all hover:shadow-brand-brown/20 hover:scale-[1.02]"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-sand" />
            <span>Install Extension</span>
          </a>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-zinc-400 hover:text-white"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-zinc-950 border-b border-zinc-800 px-6 py-6 flex flex-col gap-4 animate-in slide-in-from-top-2">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-zinc-300 hover:text-white"
          >
            Features
          </a>
          <a
            href="#workers"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-zinc-300 hover:text-white"
          >
            Digital Workers
          </a>
          <a
            href="#simulator"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-zinc-300 hover:text-white"
          >
            Interactive IDE
          </a>
          <a
            href="#architecture"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-zinc-300 hover:text-white"
          >
            Architecture
          </a>
          <a
            href="#comparison"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-medium text-zinc-300 hover:text-white"
          >
            Comparison
          </a>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={copyInstallCommand}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-mono bg-zinc-900 border border-zinc-700 text-zinc-200"
            >
              <Terminal className="w-4 h-4 text-brand-beige" />
              <span>{copied ? "Copied!" : "code --install speak2build"}</span>
            </button>
            <a
              href="#install"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-xs font-semibold bg-brand-brown text-white"
            >
              <Sparkles className="w-4 h-4" />
              <span>Install for VS Code</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

