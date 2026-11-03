import type { ReactNode } from "react";

import { PROVIDER_MODELS } from "../constants";

/**
 * Presentational LLM settings sheet. Pure rendering: every field value comes
 * in via props and every user intent goes out via callbacks. App owns the
 * state and the message flow to the host.
 */

interface SettingsSheetProps {
  selectedProvider: string;
  selectedModel: string;
  apiKeyInput: string;
  configuredProviders: Record<string, boolean>;
  settingsSavedMsg: string | null;
  testingConnection: boolean;
  testResult: { valid: boolean; message: string; latencyMs: number } | null;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (key: string) => void;
  onTestKey: () => void;
  onClose: () => void;
  onSave: () => void;
}

export function SettingsSheet({
  selectedProvider,
  selectedModel,
  apiKeyInput,
  configuredProviders,
  settingsSavedMsg,
  testingConnection,
  testResult,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  onTestKey,
  onClose,
  onSave,
}: SettingsSheetProps): ReactNode {
  const providerInfo = PROVIDER_MODELS[selectedProvider];
  const needsApiKey = providerInfo?.needsKey ?? false;

  return (
    <section className="settings-modal-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: "12px" }}>🤖 LLM Provider & Model</span>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6 }}
        >
          ✕
        </button>
      </div>

      <div className="settings-field">
        <label htmlFor="llm-provider-select">Provider</label>
        <select
          id="llm-provider-select"
          className="settings-select"
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value)}
        >
          {Object.entries(PROVIDER_MODELS).map(([key, info]) => (
            <option key={key} value={key}>
              {info.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label htmlFor="llm-model-input">Model Name</label>
          <span style={{ fontSize: "10px", opacity: 0.7 }}>e.g. gemini-2.5-flash, qwen-qwq-32b</span>
        </div>
        <input
          id="llm-model-input"
          type="text"
          className="settings-input"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="Enter model name..."
        />
      </div>

      {needsApiKey && (
        <div className="settings-field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label htmlFor="llm-api-key-input">
              API Key {configuredProviders[selectedProvider] && !apiKeyInput && (
                <span style={{ color: "#4ade80", fontWeight: "normal" }}>(Key configured ✓)</span>
              )}
            </label>
            {providerInfo?.keyUrl && (
              <span style={{ fontSize: "10px", opacity: 0.8 }}>
                {providerInfo.keyHint}
              </span>
            )}
          </div>
          <input
            id="llm-api-key-input"
            type="password"
            className="settings-input"
            value={apiKeyInput}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={
              configuredProviders[selectedProvider]
                ? "•••••••••••••••• (Leave blank to keep existing)"
                : "Paste your API key here (required)"
            }
          />
        </div>
      )}

      {!needsApiKey && (
        <div style={{ fontSize: "11px", opacity: 0.75, background: "rgba(255,255,255,0.05)", padding: "6px 8px", borderRadius: "4px" }}>
          💡 {providerInfo?.keyHint}
        </div>
      )}

      {testResult && (
        <div
          style={{
            fontSize: "11px",
            padding: "6px 8px",
            borderRadius: "4px",
            background: testResult.valid ? "rgba(35, 134, 54, 0.15)" : "rgba(218, 54, 51, 0.15)",
            border: `1px solid ${testResult.valid ? "#238636" : "#da3633"}`,
            color: testResult.valid ? "#4ade80" : "#f87171",
          }}
        >
          {testResult.valid ? "✓ " : "✗ "}
          {testResult.message}
          {testResult.valid && testResult.latencyMs > 0 && ` (${testResult.latencyMs}ms)`}
        </div>
      )}

      {settingsSavedMsg && (
        <div style={{ color: "#4ade80", fontSize: "11px", textAlign: "center" }}>
          ✓ {settingsSavedMsg}
        </div>
      )}

      <div className="settings-actions">
        <button
          className="button secondary"
          style={{ padding: "4px 10px", fontSize: "11px" }}
          disabled={testingConnection}
          onClick={onTestKey}
        >
          {testingConnection ? "Pinging…" : "🔌 Test Key"}
        </button>
        <button
          className="button secondary"
          style={{ padding: "4px 10px", fontSize: "11px" }}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button"
          style={{ padding: "4px 12px", fontSize: "11px" }}
          disabled={
            !selectedModel.trim() ||
            (needsApiKey && !configuredProviders[selectedProvider] && !apiKeyInput.trim())
          }
          title={
            needsApiKey && !configuredProviders[selectedProvider] && !apiKeyInput.trim()
              ? "Enter an API key before proceeding"
              : "Save and apply this configuration"
          }
          onClick={onSave}
        >
          Apply & Save
        </button>
      </div>
    </section>
  );
}
