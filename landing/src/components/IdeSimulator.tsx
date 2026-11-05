"use client";

import { useState } from "react";
import {
  Mic,
  Check,
  X,
  FileCode,
  Terminal,
  Sparkles,
  Wrench,
} from "lucide-react";
import FadeContent from "./reactbits/FadeContent";

type ScenarioType = "auto_repair" | "unit_tests" | "accept_diff";

export function IdeSimulator() {
  const [activeScenario, setActiveScenario] = useState<ScenarioType>("auto_repair");
  const [diffApplied, setDiffApplied] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  return (
    <section id="simulator" className="py-section bg-alma-yogurt relative">
      <div className="max-w-content mx-auto px-section-mobile lg:px-section">
        {/* Section Header */}
        <FadeContent duration={0.7}>
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 pb-8 border-b border-black/5">
            <div>
              <span className="tag-pill mb-3 inline-block">Interactive Demo</span>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-medium leading-[1] tracking-tight mt-2 text-alma-teriyaki">
                Experience hands-free
                <br />
                <em className="text-alma-collard">pair programming.</em>
              </h2>
            </div>
            <p className="text-alma-teriyaki/60 text-sm sm:text-base max-w-md mt-4 md:mt-0 leading-relaxed">
              Speak your intent naturally, review syntax diffs inline, and watch
              failing pytest suites self-heal with one spoken phrase.
            </p>
          </div>
        </FadeContent>

        {/* Interactive Scenario Switcher Pills */}
        <FadeContent delay={0.2} duration={0.6}>
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="text-xs text-alma-muted uppercase tracking-wider font-medium mr-1">
              Try Scenarios:
            </span>
            <button
              onClick={() => {
                setActiveScenario("auto_repair");
                setDiffApplied(false);
              }}
              className={`px-4 py-2 rounded-pill text-xs font-medium transition-all flex items-center gap-2 border ${
                activeScenario === "auto_repair"
                  ? "bg-alma-collard text-white border-alma-collard shadow-md"
                  : "bg-alma-surface border-black/8 text-alma-teriyaki/80 hover:border-black/20"
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>1. Self-Healing Auto-Repair (Say &quot;fix it&quot;)</span>
            </button>

            <button
              onClick={() => {
                setActiveScenario("unit_tests");
                setDiffApplied(false);
              }}
              className={`px-4 py-2 rounded-pill text-xs font-medium transition-all flex items-center gap-2 border ${
                activeScenario === "unit_tests"
                  ? "bg-alma-collard text-white border-alma-collard shadow-md"
                  : "bg-alma-surface border-black/8 text-alma-teriyaki/80 hover:border-black/20"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>2. Zero-Clarification Tests</span>
            </button>

            <button
              onClick={() => {
                setActiveScenario("accept_diff");
                setDiffApplied(false);
              }}
              className={`px-4 py-2 rounded-pill text-xs font-medium transition-all flex items-center gap-2 border ${
                activeScenario === "accept_diff"
                  ? "bg-alma-collard text-white border-alma-collard shadow-md"
                  : "bg-alma-surface border-black/8 text-alma-teriyaki/80 hover:border-black/20"
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>3. Voice Review: &quot;Apply diffs&quot;</span>
            </button>
          </div>
        </FadeContent>

        {/* Mock VS Code Window with Soft Alma Framing */}
        <FadeContent delay={0.3} duration={0.8}>
          <div className="rounded-3xl border border-black/10 bg-[#141413] shadow-2xl overflow-hidden">
            {/* Top Window Chrome Titlebar */}
            <div className="bg-[#1e1e1b] px-5 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block" />
                <span className="ml-3 text-xs font-mono text-white/50 flex items-center gap-2">
                  <span>workspace/api_service</span>
                  <span className="text-white/20">—</span>
                  <span>Visual Studio Code</span>
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-white/50">
                <span className="flex items-center gap-1.5 text-alma-kiwi">
                  <span className="w-2 h-2 rounded-full bg-alma-kiwi animate-pulse" />
                  VAD Engine: 42ms
                </span>
                <span className="text-white/30">Ctrl + Alt + Space</span>
              </div>
            </div>

            {/* IDE Body Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
              {/* Left: Speak2Build Sidebar Panel */}
              <div className="lg:col-span-5 bg-[#181816] border-r border-white/5 flex flex-col justify-between p-4">
                {/* Header Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-alma-collard flex items-center justify-center">
                      <Mic className="w-3.5 h-3.5 text-alma-kiwi" />
                    </div>
                    <span className="text-xs font-semibold text-white tracking-wide">
                      Speak2Build
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-alma-kiwi/15 text-alma-kiwi border border-alma-kiwi/30">
                      Hands-Free
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-white/40 font-mono">
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-[11px]">
                      🎧 VAD Active
                    </span>
                  </div>
                </div>

                {/* Chat Stream / Message Feed */}
                <div className="flex-1 py-4 overflow-y-auto space-y-4 text-xs">
                  {/* Session Started Header */}
                  <div className="flex items-center gap-3 my-2 opacity-80">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="px-2.5 py-1 rounded-full bg-white/5 text-[10px] font-mono text-white/50 flex items-center gap-1.5">
                      <span>💬</span>
                      <span>Chat Session Started · 11:49 PM</span>
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  {/* Turn 1: User Request */}
                  <div className="flex flex-col items-end">
                    <div className="bg-alma-collard text-white rounded-2xl rounded-tr-none px-3.5 py-2.5 max-w-[90%] shadow-sm">
                      {activeScenario === "auto_repair" && (
                        <p>Run tests for notes and fix any database failure.</p>
                      )}
                      {activeScenario === "unit_tests" && (
                        <p>Add comprehensive unit tests for the auth router.</p>
                      )}
                      {activeScenario === "accept_diff" && (
                        <p>Add rate limiter middleware to app.py.</p>
                      )}
                    </div>
                    <span className="text-[10px] text-white/40 font-mono mt-1">
                      Transcribed via Whisper
                    </span>
                  </div>

                  {/* Assistant Output & Stages */}
                  <div className="flex flex-col items-start space-y-2.5">
                    {/* Context Auto-Crawling Badge */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/80 w-full">
                      <span className="text-alma-kiwi">✓</span>
                      <span className="font-mono text-white/50">Context Crawled:</span>
                      <span className="text-white/90">2 files indexed (FastAPI, SQLite)</span>
                    </div>

                    {/* Test Runner Failure Block */}
                    {activeScenario === "auto_repair" && (
                      <div className="w-full rounded-2xl border border-red-500/20 bg-red-950/20 p-3.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-red-400 flex items-center gap-1.5">
                            <X className="w-3.5 h-3.5" />
                            <span>Tests Failed: 1 error in 0.19s</span>
                          </span>
                          <span className="text-[10px] font-mono text-white/40">pytest</span>
                        </div>
                        <p className="font-mono text-[11px] text-white/70 bg-black/40 p-2.5 rounded-xl border border-white/5 mb-2.5">
                          AssertionError: Expected 200 OK, got 500 (sqlite3.OperationalError: no such table)
                        </p>
                        <button
                          onClick={() => setDiffApplied(true)}
                          className="w-full py-2 rounded-pill btn-alma text-xs flex items-center justify-center gap-2"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>Auto-Repair with AI (or say &quot;fix it&quot;)</span>
                        </button>
                      </div>
                    )}

                    {/* Chronological Auto-Repair Turn */}
                    {activeScenario === "auto_repair" && (
                      <div className="w-full rounded-2xl border border-alma-kiwi/20 bg-alma-kiwi/10 p-3 mt-2">
                        <div className="flex items-center gap-1.5 text-alma-kiwi font-medium mb-1">
                          <span>🔧</span>
                          <span>[Auto-Repair] Fixed missing table schema initialization</span>
                        </div>
                        <span className="text-[10px] font-mono text-white/50">
                          Unified Diff produced · Ready for review
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Input Bar */}
                <div className="pt-3 border-t border-white/5">
                  <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-pill px-3 py-1.5">
                    <input
                      type="text"
                      readOnly
                      value={
                        isListening
                          ? "Listening... (speak naturally)"
                          : 'Say: "fix it", "run tests", or "accept all"'
                      }
                      className="bg-transparent text-xs text-white/90 focus:outline-none flex-1 font-mono pl-2"
                    />
                    <button
                      onClick={toggleListening}
                      className={`p-2 rounded-full transition-colors ${
                        isListening
                          ? "bg-red-500/30 text-red-400 animate-pulse"
                          : "bg-alma-collard text-white hover:bg-alma-collard/80"
                      }`}
                      title="Toggle microphone"
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-white/40 font-mono mt-2 px-1">
                    <span>Enter to send · Shift+Enter newline</span>
                    <span className="text-alma-kiwi">Silero VAD Active</span>
                  </div>
                </div>
              </div>

              {/* Right: Main Editor with Unified Syntax Diff Viewer */}
              <div className="lg:col-span-7 bg-[#141413] flex flex-col justify-between">
                {/* File Tabs */}
                <div className="bg-[#1c1c1a] border-b border-white/5 flex items-center justify-between px-3">
                  <div className="flex items-center">
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#141413] border-r border-white/5 text-xs font-mono text-alma-kiwi border-t-2 border-t-alma-collard">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>services/database.py</span>
                      <span className="text-[10px] text-white/40">M</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-white/40 hover:text-white/70">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>tests/test_api.py</span>
                    </div>
                  </div>

                  {/* Diff Review Actions in Editor */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDiffApplied(true)}
                      className="flex items-center gap-1 px-3 py-1 rounded-pill bg-alma-kiwi/20 hover:bg-alma-kiwi/30 text-alma-kiwi text-[11px] font-mono transition-colors border border-alma-kiwi/30"
                    >
                      <Check className="w-3 h-3" />
                      <span>Accept (Say &quot;apply&quot;)</span>
                    </button>
                    <button
                      onClick={() => setDiffApplied(false)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-pill bg-white/5 hover:bg-white/10 text-white/60 text-[11px] font-mono transition-colors"
                    >
                      <X className="w-3 h-3" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>

                {/* Code Editor Body */}
                <div className="p-4 font-mono text-xs overflow-x-auto leading-relaxed flex-1 bg-black/30">
                  <div className="text-white/40 mb-2">@@ -14,8 +14,14 @@ def init_db(db_path: str):</div>

                  <div className="text-white/60 select-none">
                    <span className="inline-block w-8 text-white/30">14</span>
                    <span>    connection = sqlite3.connect(db_path)</span>
                  </div>
                  <div className="text-white/60 select-none">
                    <span className="inline-block w-8 text-white/30">15</span>
                    <span>    cursor = connection.cursor()</span>
                  </div>

                  {/* Removed Line */}
                  <div className="bg-red-950/40 text-red-300 -mx-4 px-4 border-l-2 border-red-500">
                    <span className="inline-block w-8 text-red-400 font-semibold">- 16</span>
                    <span>-   # Missing schema initialization</span>
                  </div>

                  {/* Added Lines */}
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                    <span className="inline-block w-8 text-emerald-400 font-semibold">+ 16</span>
                    <span>+   cursor.execute(&quot;&quot;&quot;</span>
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                    <span className="inline-block w-8 text-emerald-400 font-semibold">+ 17</span>
                    <span>+       CREATE TABLE IF NOT EXISTS notes (</span>
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                    <span className="inline-block w-8 text-emerald-400 font-semibold">+ 18</span>
                    <span>+           id INTEGER PRIMARY KEY AUTOINCREMENT,</span>
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                    <span className="inline-block w-8 text-emerald-400 font-semibold">+ 19</span>
                    <span>+           title TEXT NOT NULL, content TEXT</span>
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                    <span className="inline-block w-8 text-emerald-400 font-semibold">+ 20</span>
                    <span>+       );</span>
                  </div>
                  <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                    <span className="inline-block w-8 text-emerald-400 font-semibold">+ 21</span>
                    <span>+   &quot;&quot;&quot;)</span>
                  </div>

                  <div className="text-white/60 select-none mt-1">
                    <span className="inline-block w-8 text-white/30">22</span>
                    <span>    connection.commit()</span>
                  </div>
                  <div className="text-white/60 select-none">
                    <span className="inline-block w-8 text-white/30">23</span>
                    <span>    return connection</span>
                  </div>

                  {/* Diff applied indicator */}
                  {diffApplied && (
                    <div className="mt-6 p-3 rounded-2xl bg-alma-collard/40 border border-alma-kiwi/30 text-alma-kiwi flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      <span>Diff successfully applied to database.py. Pytest re-run: 157 passed!</span>
                    </div>
                  )}
                </div>

                {/* Terminal Simulation Bar */}
                <div className="bg-[#10100f] border-t border-white/5 p-3 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2 text-white/50">
                    <Terminal className="w-3.5 h-3.5 text-alma-kiwi" />
                    <span>pytest backend/tests/</span>
                    <span className="text-alma-kiwi">=== 157 passed in 1.42s ===</span>
                  </div>

                  <div className="text-[11px] text-white/40">
                    <span>Exit Code 0</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeContent>
      </div>
    </section>
  );
}
