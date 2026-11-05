"use client";

import { useState, useEffect } from "react";
import { Mic, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#architecture" },
  { label: "Compare", href: "#compare" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const copyCommand = () => {
    navigator.clipboard.writeText("code --install-extension speak2build");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <nav
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-alma-surface/90 backdrop-blur-lg shadow-lg border border-black/5"
          : "bg-alma-collard/95 backdrop-blur-sm"
      } rounded-pill px-6 py-3 max-w-2xl w-[calc(100%-32px)]`}
    >
      <div className="flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 group">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              scrolled ? "bg-alma-collard" : "bg-alma-kiwi/20"
            }`}
          >
            <Mic
              size={16}
              className={scrolled ? "text-white" : "text-alma-kiwi"}
            />
          </div>
          <span
            className={`font-display text-lg font-semibold tracking-tight ${
              scrolled ? "text-alma-teriyaki" : "text-white"
            }`}
          >
            Speak2Build
          </span>
        </a>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                scrolled
                  ? "text-alma-teriyaki/70 hover:text-alma-teriyaki"
                  : "text-white/80 hover:text-white"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:block">
          <button
            onClick={copyCommand}
            className={`text-sm font-medium px-4 py-2 rounded-pill transition-all ${
              scrolled
                ? "btn-alma"
                : "bg-white/15 hover:bg-white/25 text-white border border-white/20"
            }`}
          >
            {copied ? "✓ Copied!" : "Install Extension"}
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? (
            <X size={20} className={scrolled ? "text-alma-teriyaki" : "text-white"} />
          ) : (
            <Menu size={20} className={scrolled ? "text-alma-teriyaki" : "text-white"} />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-4 pb-2 border-t border-black/10 pt-4 flex flex-col gap-3">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`text-sm font-medium ${
                scrolled ? "text-alma-teriyaki" : "text-white"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <button onClick={copyCommand} className="btn-alma text-sm mt-2">
            {copied ? "✓ Copied!" : "Install Extension"}
          </button>
        </div>
      )}
    </nav>
  );
}
