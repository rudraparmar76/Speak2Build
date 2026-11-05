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
  CheckCircle2,
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

  const selectScenario = (scenario: ScenarioType) => {
    setActiveScenario(scenario);
    setDiffApplied(false);
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
              onClick={() => selectScenario("auto_repair")}
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
              onClick={() => selectScenario("unit_tests")}
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
              onClick={() => selectScenario("accept_diff")}
              className={`px-4 py-2 rounded-pill text-xs font-medium transition-all flex items-center gap-2 border ${
                activeScenario === "accept_diff"
                  ? "bg-alma-collard text-white border-alma-collard shadow-md"
                  : "bg-alma-surface border-black/8 text-alma-teriyaki/80 hover:border-black/20"
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>3. Voice Review (&quot;Apply diffs&quot;)</span>
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
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
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

                  {/* Scenario 1: Auto-Repair Message Flow */}
                  {activeScenario === "auto_repair" && (
                    <>
                      <div className="flex flex-col items-end">
                        <div className="bg-alma-collard text-white rounded-2xl rounded-tr-none px-3.5 py-2.5 max-w-[90%] shadow-sm">
                          <p>Run tests for notes and fix any database failure.</p>
                        </div>
                        <span className="text-[10px] text-white/40 font-mono mt-1">
                          Transcribed via Whisper
                        </span>
                      </div>

                      <div className="flex flex-col items-start space-y-2.5">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/80 w-full">
                          <span className="text-alma-kiwi">✓</span>
                          <span className="font-mono text-white/50">Context Crawled:</span>
                          <span className="text-white/90">2 files indexed (FastAPI, SQLite)</span>
                        </div>

                        {/* Test Runner Failure Block */}
                        <div className="w-full rounded-2xl border border-red-500/20 bg-red-950/20 p-3.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-red-400 flex items-center gap-1.5">
                              <X className="w-3.5 h-3.5" />
                              <span>Tests Failed: 1 error in 0.19s</span>
                            </span>
                            <span className="text-[10px] font-mono text-white/40">pytest</span>
                          </div>
                          <p className="font-mono text-[11px] text-white/70 bg-black/40 p-2.5 rounded-xl border border-white/5 mb-2.5">
                            OperationalError: no such table: notes
                          </p>
                          <button
                            onClick={() => setDiffApplied(true)}
                            className="w-full py-2 rounded-pill btn-alma text-xs flex items-center justify-center gap-2"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>Auto-Repair with AI (or say &quot;fix it&quot;)</span>
                          </button>
                        </div>

                        {/* Chronological Repair Response */}
                        <div className="w-full rounded-2xl border border-alma-kiwi/20 bg-alma-kiwi/10 p-3">
                          <div className="flex items-center gap-1.5 text-alma-kiwi font-medium mb-1">
                            <span>🔧</span>
                            <span>[Auto-Repair] Added CREATE TABLE IF NOT EXISTS in database.py</span>
                          </div>
                          <span className="text-[10px] font-mono text-white/50">
                            Unified Diff produced · Ready for review
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Scenario 2: Zero-Clarification Tests Message Flow */}
                  {activeScenario === "unit_tests" && (
                    <>
                      <div className="flex flex-col items-end">
                        <div className="bg-alma-collard text-white rounded-2xl rounded-tr-none px-3.5 py-2.5 max-w-[90%] shadow-sm">
                          <p>Add comprehensive unit tests for the auth router.</p>
                        </div>
                        <span className="text-[10px] text-white/40 font-mono mt-1">
                          Transcribed via Whisper
                        </span>
                      </div>

                      <div className="flex flex-col items-start space-y-2.5">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-[11px] text-white/80 w-full">
                          <span className="text-alma-kiwi">✓</span>
                          <span className="font-mono text-white/50">AST Crawled:</span>
                          <span className="text-white/90">auth.py, models.py (no user clarification needed)</span>
                        </div>

                        <div className="w-full rounded-2xl border border-alma-kiwi/20 bg-alma-kiwi/10 p-3.5">
                          <div className="flex items-center gap-1.5 text-alma-kiwi font-semibold mb-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Generated tests/test_auth.py</span>
                          </div>
                          <p className="text-[11px] text-white/70 mb-2 leading-relaxed">
                            Created 3 test fixtures covering login success, invalid tokens, and expired JWT signatures.
                          </p>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                            <span>✓ Zero interruptions</span>
                            <span>•</span>
                            <span>Ready to validate</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Scenario 3: Real Voice Review Message Flow */}
                  {activeScenario === "accept_diff" && (
                    <>
                      {/* User Request 1 */}
                      <div className="flex flex-col items-end">
                        <div className="bg-alma-collard text-white rounded-2xl rounded-tr-none px-3.5 py-2.5 max-w-[90%] shadow-sm">
                          <p>Review the JWT auth diff in services/auth.py and check if token expiry is safe.</p>
                        </div>
                        <span className="text-[10px] text-white/40 font-mono mt-1">
                          Spoken Voice Command · 11:50 PM
                        </span>
                      </div>

                      {/* AI Code Review Analysis */}
                      <div className="flex flex-col items-start space-y-2.5">
                        <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-3.5">
                          <div className="flex items-center gap-1.5 text-alma-kiwi font-semibold mb-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Voice Review Summary: Safe</span>
                          </div>
                          <p className="text-[11px] text-white/80 leading-relaxed mb-2">
                            Token expiration is securely set to 8 hours using UTC timestamps. Secret key is loaded from environment variables with HMAC-SHA256.
                          </p>
                          <div className="text-[10px] font-mono text-white/50 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                            Spoken prompt: &quot;Looks good, apply diff and run tests.&quot;
                          </div>
                        </div>

                        {/* Confirmation Turn */}
                        <div className="w-full rounded-2xl border border-alma-kiwi/20 bg-alma-kiwi/10 p-3">
                          <div className="flex items-center justify-between text-alma-kiwi font-medium mb-1">
                            <span className="flex items-center gap-1.5">
                              <span>✓</span>
                              <span>Ready to Apply</span>
                            </span>
                            <span className="text-[10px] font-mono text-white/40">1 file · +6 lines</span>
                          </div>
                          <p className="text-[11px] text-white/60">
                            Say &quot;apply&quot; into your mic or click Accept Diff above.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
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
                          : activeScenario === "accept_diff"
                          ? 'Say: "apply diff" or "looks good"'
                          : activeScenario === "unit_tests"
                          ? 'Say: "run test suite"'
                          : 'Say: "fix it" or "repair database"'
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

              {/* Right: Main Editor with Contextual Syntax Code & Fixed Accept Button */}
              <div className="lg:col-span-7 bg-[#141413] flex flex-col justify-between">
                {/* File Tabs & Actions */}
                <div className="bg-[#1c1c1a] border-b border-white/5 flex items-center justify-between px-3 py-1.5 gap-2">
                  <div className="flex items-center overflow-x-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141413] rounded-t-lg border-t-2 border-t-alma-kiwi text-xs font-mono text-alma-kiwi">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>
                        {activeScenario === "auto_repair" && "services/database.py"}
                        {activeScenario === "unit_tests" && "tests/test_auth.py"}
                        {activeScenario === "accept_diff" && "services/auth.py"}
                      </span>
                      <span className="text-[10px] text-white/40">
                        {diffApplied ? "Saved" : "Modified"}
                      </span>
                    </div>
                  </div>

                  {/* Fixed Accept/Reject Diff Buttons (Single-Line, No Ugly Text Wrapping) */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setDiffApplied(!diffApplied)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-pill text-xs font-mono font-medium whitespace-nowrap transition-all ${
                        diffApplied
                          ? "bg-alma-kiwi text-alma-collard border border-alma-kiwi shadow-md"
                          : "bg-alma-kiwi/20 hover:bg-alma-kiwi/30 text-alma-kiwi border border-alma-kiwi/30"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{diffApplied ? "Diff Applied ✓" : "Accept Diff"}</span>
                      <span className="hidden sm:inline opacity-60 text-[10px]">
                        (&quot;apply&quot;)
                      </span>
                    </button>
                    <button
                      onClick={() => setDiffApplied(false)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-pill bg-white/5 hover:bg-white/10 text-white/60 text-xs font-mono transition-colors whitespace-nowrap"
                    >
                      <X className="w-3 h-3" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>

                {/* Code Editor Body */}
                <div className="p-4 font-mono text-xs overflow-x-auto leading-relaxed flex-1 bg-black/30">
                  {/* Scenario 1: Auto Repair Code (Database table fix) */}
                  {activeScenario === "auto_repair" && (
                    <>
                      <div className="text-white/40 mb-2">@@ -14,8 +14,14 @@ def init_db(db_path: str):</div>
                      <div className="text-white/60 select-none">
                        <span className="inline-block w-8 text-white/30">14</span>
                        <span>    connection = sqlite3.connect(db_path)</span>
                      </div>
                      <div className="text-white/60 select-none">
                        <span className="inline-block w-8 text-white/30">15</span>
                        <span>    cursor = connection.cursor()</span>
                      </div>

                      {!diffApplied ? (
                        <>
                          <div className="bg-red-950/40 text-red-300 -mx-4 px-4 border-l-2 border-red-500">
                            <span className="inline-block w-8 text-red-400 font-semibold">- 16</span>
                            <span>-   # Missing schema initialization</span>
                          </div>
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
                        </>
                      ) : (
                        <div className="text-emerald-300 bg-emerald-950/20 -mx-4 px-4 py-1 border-l-2 border-emerald-400">
                          <div><span className="inline-block w-8 text-emerald-400/60">16</span>    cursor.execute(&quot;&quot;&quot;</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">17</span>        CREATE TABLE IF NOT EXISTS notes (</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">18</span>            id INTEGER PRIMARY KEY AUTOINCREMENT,</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">19</span>            title TEXT NOT NULL, content TEXT</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">20</span>        );</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">21</span>    &quot;&quot;&quot;)</div>
                        </div>
                      )}

                      <div className="text-white/60 select-none mt-1">
                        <span className="inline-block w-8 text-white/30">22</span>
                        <span>    connection.commit()</span>
                      </div>
                      <div className="text-white/60 select-none">
                        <span className="inline-block w-8 text-white/30">23</span>
                        <span>    return connection</span>
                      </div>
                    </>
                  )}

                  {/* Scenario 2: Unit Tests Code */}
                  {activeScenario === "unit_tests" && (
                    <>
                      <div className="text-white/40 mb-2">@@ -1,0 +1,18 @@ (New file generated)</div>
                      <div className="space-y-1">
                        <div className="text-purple-400"><span className="inline-block w-8 text-white/30">1</span>import pytest</div>
                        <div className="text-purple-400"><span className="inline-block w-8 text-white/30">2</span>from httpx import AsyncClient</div>
                        <div className="text-purple-400"><span className="inline-block w-8 text-white/30">3</span>from main import app</div>
                        <div className="text-white/30 select-none"><span className="inline-block w-8 text-white/20">4</span></div>
                        <div className="bg-emerald-950/30 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                          <span className="inline-block w-8 text-emerald-400/70 font-semibold">+ 5</span>
                          <span>@pytest.mark.anyio</span>
                        </div>
                        <div className="bg-emerald-950/30 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                          <span className="inline-block w-8 text-emerald-400/70 font-semibold">+ 6</span>
                          <span>async def test_auth_login_success():</span>
                        </div>
                        <div className="bg-emerald-950/30 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                          <span className="inline-block w-8 text-emerald-400/70 font-semibold">+ 7</span>
                          <span>    async with AsyncClient(app=app, base_url=&quot;http://test&quot;) as ac:</span>
                        </div>
                        <div className="bg-emerald-950/30 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                          <span className="inline-block w-8 text-emerald-400/70 font-semibold">+ 8</span>
                          <span>        res = await ac.post(&quot;/auth/login&quot;, json=&#123;&quot;user&quot;: &quot;alice&quot;&#125;)</span>
                        </div>
                        <div className="bg-emerald-950/30 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                          <span className="inline-block w-8 text-emerald-400/70 font-semibold">+ 9</span>
                          <span>        assert res.status_code == 200</span>
                        </div>
                        <div className="bg-emerald-950/30 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                          <span className="inline-block w-8 text-emerald-400/70 font-semibold">+ 10</span>
                          <span>        assert &quot;access_token&quot; in res.json()</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Scenario 3: Real Voice Review Code (Safe JWT Expiry) */}
                  {activeScenario === "accept_diff" && (
                    <>
                      <div className="text-white/40 mb-2">@@ -8,7 +8,13 @@ def create_access_token(user_id: str):</div>
                      <div className="text-white/60 select-none">
                        <span className="inline-block w-8 text-white/30">8</span>
                        <span>def create_access_token(user_id: str):</span>
                      </div>

                      {!diffApplied ? (
                        <>
                          <div className="bg-red-950/40 text-red-300 -mx-4 px-4 border-l-2 border-red-500">
                            <span className="inline-block w-8 text-red-400 font-semibold">- 9</span>
                            <span>-   expire = datetime.utcnow() + timedelta(days=365)  # INSECURE</span>
                          </div>
                          <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                            <span className="inline-block w-8 text-emerald-400 font-semibold">+ 9</span>
                            <span>+   # Reviewed: Safe 8-hour UTC expiry with cryptographic signing</span>
                          </div>
                          <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                            <span className="inline-block w-8 text-emerald-400 font-semibold">+ 10</span>
                            <span>+   expire = datetime.now(timezone.utc) + timedelta(hours=8)</span>
                          </div>
                          <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                            <span className="inline-block w-8 text-emerald-400 font-semibold">+ 11</span>
                            <span>+   payload = &#123;&quot;sub&quot;: user_id, &quot;exp&quot;: expire, &quot;type&quot;: &quot;access&quot;&#125;</span>
                          </div>
                          <div className="bg-emerald-950/40 text-emerald-300 -mx-4 px-4 border-l-2 border-emerald-400">
                            <span className="inline-block w-8 text-emerald-400 font-semibold">+ 12</span>
                            <span>+   return jwt.encode(payload, settings.SECRET_KEY, algorithm=&quot;HS256&quot;)</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-emerald-300 bg-emerald-950/20 -mx-4 px-4 py-1 border-l-2 border-emerald-400">
                          <div><span className="inline-block w-8 text-emerald-400/60">9</span>    # Reviewed: Safe 8-hour UTC expiry with cryptographic signing</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">10</span>    expire = datetime.now(timezone.utc) + timedelta(hours=8)</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">11</span>    payload = &#123;&quot;sub&quot;: user_id, &quot;exp&quot;: expire, &quot;type&quot;: &quot;access&quot;&#125;</div>
                          <div><span className="inline-block w-8 text-emerald-400/60">12</span>    return jwt.encode(payload, settings.SECRET_KEY, algorithm=&quot;HS256&quot;)</div>
                        </div>
                      )}

                      <div className="text-white/60 select-none mt-1">
                        <span className="inline-block w-8 text-white/30">13</span>
                        <span>    # return encoded token</span>
                      </div>
                    </>
                  )}

                  {/* Diff applied feedback indicator */}
                  {diffApplied && (
                    <div className="mt-6 p-3 rounded-2xl bg-alma-collard/40 border border-alma-kiwi/30 text-alma-kiwi flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-alma-kiwi" />
                        <span className="font-sans font-medium text-xs">
                          Diff successfully applied. Workspace tests automatically verified!
                        </span>
                      </div>
                      <span className="text-[10px] font-mono opacity-70">157 passed</span>
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
