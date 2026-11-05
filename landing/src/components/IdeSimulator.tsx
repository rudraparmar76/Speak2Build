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

type ScenarioType = "unit_tests" | "auto_repair" | "accept_diff";

export function IdeSimulator() {
  const [activeScenario, setActiveScenario] = useState<ScenarioType>("auto_repair");
  const [diffApplied, setDiffApplied] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  return (
    <section id="simulator" className="py-24 md:py-32 bg-black relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 border-b border-zinc-800 pb-8">
          <div>
            <div className="flex items-center gap-2 text-brand-beige font-mono text-xs uppercase tracking-widest mb-2">
              <span>Hands-On Simulation</span>
              <span>•</span>
              <span>VS Code Webview Architecture</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-tight text-white">
              Experience Hands-Free Coding.
            </h2>
          </div>
          <p className="text-zinc-400 text-sm md:text-base max-w-md mt-4 md:mt-0 font-normal">
            Speak your intent, review syntax diffs inline, and watch failing pytest suites self-heal with one spoken
            phrase.
          </p>
        </div>

        {/* Interactive Scenario Switcher Pills */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <span className="text-xs text-zinc-500 font-mono uppercase mr-2">Try Scenarios:</span>
          <button
            onClick={() => {
              setActiveScenario("auto_repair");
              setDiffApplied(false);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border ${
              activeScenario === "auto_repair"
                ? "bg-brand-brown/20 border-brand-sand text-brand-sand shadow-sm"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-brand-beige" />
            <span>1. Self-Healing Auto-Repair (Say &quot;fix it&quot;)</span>
          </button>

          <button
            onClick={() => {
              setActiveScenario("unit_tests");
              setDiffApplied(false);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border ${
              activeScenario === "unit_tests"
                ? "bg-brand-brown/20 border-brand-sand text-brand-sand shadow-sm"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-beige" />
            <span>2. Zero-Clarification Test Generation</span>
          </button>

          <button
            onClick={() => {
              setActiveScenario("accept_diff");
              setDiffApplied(false);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 border ${
              activeScenario === "accept_diff"
                ? "bg-brand-brown/20 border-brand-sand text-brand-sand shadow-sm"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>3. Voice Review: &quot;Apply all diffs&quot;</span>
          </button>
        </div>

        {/* Mock VS Code Window */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
          {/* Top Window Chrome Titlebar */}
          <div className="bg-zinc-900 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
              <span className="ml-3 text-xs font-mono text-zinc-400 flex items-center gap-2">
                <span>workspace/api_service</span>
                <span className="text-zinc-600">—</span>
                <span>Visual Studio Code</span>
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                VAD Engine: 48ms
              </span>
              <span>Ctrl + Alt + Space</span>
            </div>
          </div>

          {/* IDE Body Grid: Left Sidebar (Speak2Build Chat) | Right Main Editor */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
            {/* Left: Speak2Build Sidebar Panel */}
            <div className="lg:col-span-5 bg-zinc-950 border-r border-zinc-800 flex flex-col justify-between p-4">
              {/* Header Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-brand-brown/40 border border-brand-brown/60 flex items-center justify-center">
                    <Mic className="w-3.5 h-3.5 text-brand-beige" />
                  </div>
                  <span className="text-xs font-bold text-white tracking-wide">Speak2Build</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                    Hands-Free
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs text-zinc-400 font-mono">
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                    🎧 VAD Active
                  </span>
                </div>
              </div>

              {/* Chat Stream / Message Feed */}
              <div className="flex-1 py-4 overflow-y-auto space-y-4 text-xs">
                {/* Visual Session Started Header */}
                <div className="flex items-center gap-3 my-2 opacity-80">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 flex items-center gap-1.5">
                    <span>💬</span>
                    <span>Chat Session Started · 11:49 PM</span>
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                {/* Turn 1: User Request */}
                <div className="flex flex-col items-end">
                  <div className="bg-brand-accent/40 border border-brand-brown/40 rounded-xl rounded-tr-none px-3.5 py-2.5 max-w-[90%] text-zinc-100">
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
                  <span className="text-[10px] text-zinc-500 font-mono mt-1">Transcribed via Whisper</span>
                </div>

                {/* Assistant Output & Stages */}
                <div className="flex flex-col items-start space-y-2.5">
                  {/* Context Auto-Crawling Badge (Zero annoying clarifications!) */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300 w-full">
                    <span className="text-emerald-400">✓</span>
                    <span className="font-mono text-zinc-400">Context Crawled:</span>
                    <span className="text-zinc-200">2 files indexed (FastAPI, SQLite)</span>
                  </div>

                  {/* Test Runner Failure Block (Before repair) */}
                  {activeScenario === "auto_repair" && (
                    <div className="w-full rounded-lg border border-red-900/40 bg-red-950/20 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-red-400 flex items-center gap-1.5">
                          <X className="w-3.5 h-3.5" />
                          <span>Tests Failed: 1 error in 0.19s</span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">pytest</span>
                      </div>
                      <p className="font-mono text-[11px] text-zinc-400 bg-black/60 p-2 rounded border border-zinc-900 mb-2">
                        AssertionError: Expected 200 OK, got 500 (sqlite3.OperationalError: no such table)
                      </p>
                      <button
                        onClick={() => setDiffApplied(true)}
                        className="w-full py-1.5 rounded bg-brand-brown hover:bg-brand-accent text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Auto-Repair with AI (or say &quot;fix it&quot;)</span>
                      </button>
                    </div>
                  )}

                  {/* Chronological Auto-Repair Message (Appears AFTER the failing test!) */}
                  {activeScenario === "auto_repair" && (
                    <div className="w-full rounded-lg border border-brand-brown/40 bg-brand-brown/10 p-3 mt-2 animate-in fade-in">
                      <div className="flex items-center gap-1.5 text-brand-sand font-medium mb-1">
                        <span>🔧</span>
                        <span>[Auto-Repair] Fixed missing table schema initialization in database.py</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">
                        Unified Diff produced · Ready for review
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Input Bar */}
              <div className="pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2">
                  <input
                    type="text"
                    readOnly
                    value={
                      isListening
                        ? "Listening... (speak naturally)"
                        : 'Say: "fix it", "run tests", or "accept all"'
                    }
                    className="bg-transparent text-xs text-zinc-200 focus:outline-none flex-1 font-mono"
                  />
                  <button
                    onClick={toggleListening}
                    className={`p-2 rounded-lg transition-colors ${
                      isListening ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-brand-brown text-white"
                    }`}
                    title="Toggle microphone"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mt-2">
                  <span>Enter to send · Shift+Enter newline</span>
                  <span className="text-brand-beige">Hands-Free Silero VAD Active</span>
                </div>
              </div>
            </div>

            {/* Right: Main Editor with Unified Syntax Diff Viewer */}
            <div className="lg:col-span-7 bg-zinc-950 flex flex-col justify-between">
              {/* File Tabs */}
              <div className="bg-zinc-900/70 border-b border-zinc-800 flex items-center justify-between px-3">
                <div className="flex items-center">
                  <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950 border-r border-zinc-800 text-xs font-mono text-brand-beige border-t-2 border-t-brand-brown">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>services/database.py</span>
                    <span className="text-[10px] text-zinc-500">M</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-zinc-400 hover:text-zinc-200">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>tests/test_api.py</span>
                  </div>
                </div>

                {/* Diff Review Actions in Editor */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDiffApplied(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-700/50 text-[11px] font-mono transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    <span>Accept (Say &quot;apply&quot;)</span>
                  </button>
                  <button
                    onClick={() => setDiffApplied(false)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono transition-colors"
                  >
                    <X className="w-3 h-3" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {/* Code Editor Body */}
              <div className="p-4 font-mono text-xs overflow-x-auto leading-relaxed flex-1 bg-black/60">
                <div className="text-zinc-500 mb-2">@@ -14,8 +14,14 @@ def init_db(db_path: str):</div>

                <div className="text-zinc-400 select-none">
                  <span className="inline-block w-8 text-zinc-600">14</span>
                  <span>    connection = sqlite3.connect(db_path)</span>
                </div>
                <div className="text-zinc-400 select-none">
                  <span className="inline-block w-8 text-zinc-600">15</span>
                  <span>    cursor = connection.cursor()</span>
                </div>

                {/* Removed Line (Red) */}
                <div className="bg-red-950/40 text-red-300 -mx-4 px-4 border-l-2 border-red-500">
                  <span className="inline-block w-8 text-red-500/70 font-semibold">- 16</span>
                  <span>-   # Missing schema initialization</span>
                </div>

                {/* Added Lines (Green) */}
                <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                  <span className="inline-block w-8 text-emerald-500/70 font-semibold">+ 16</span>
                  <span>+   cursor.execute(&quot;&quot;&quot;</span>
                </div>
                <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                  <span className="inline-block w-8 text-emerald-500/70 font-semibold">+ 17</span>
                  <span>+       CREATE TABLE IF NOT EXISTS notes (</span>
                </div>
                <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                  <span className="inline-block w-8 text-emerald-500/70 font-semibold">+ 18</span>
                  <span>+           id INTEGER PRIMARY KEY AUTOINCREMENT,</span>
                </div>
                <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                  <span className="inline-block w-8 text-emerald-500/70 font-semibold">+ 19</span>
                  <span>+           title TEXT NOT NULL, content TEXT</span>
                </div>
                <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                  <span className="inline-block w-8 text-emerald-500/70 font-semibold">+ 20</span>
                  <span>+       );</span>
                </div>
                <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-500">
                  <span className="inline-block w-8 text-emerald-500/70 font-semibold">+ 21</span>
                  <span>+   &quot;&quot;&quot;)</span>
                </div>

                <div className="text-zinc-400 select-none mt-1">
                  <span className="inline-block w-8 text-zinc-600">22</span>
                  <span>    connection.commit()</span>
                </div>
                <div className="text-zinc-400 select-none">
                  <span className="inline-block w-8 text-zinc-600">23</span>
                  <span>    return connection</span>
                </div>

                {/* Diff applied indicator */}
                {diffApplied && (
                  <div className="mt-6 p-3 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Diff successfully applied to services/database.py. Pytest re-run: 157 passed!</span>
                  </div>
                )}
              </div>

              {/* Terminal Simulation Bar */}
              <div className="bg-black border-t border-zinc-800 p-3 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-zinc-400">
                  <Terminal className="w-3.5 h-3.5 text-brand-beige" />
                  <span>pytest backend/tests/</span>
                  <span className="text-emerald-400">=== 157 passed in 1.42s ===</span>
                </div>

                <div className="text-[11px] text-zinc-500">
                  <span>Exit Code 0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

