import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// ============================================================================
// NOCTIS V1 - CLEAN MINIMAL UI
// ============================================================================

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  is_primary: boolean;
}

interface Settings {
  monitorIndex: number;
  hotkey: string;
}

const DEFAULT_SETTINGS: Settings = {
  monitorIndex: 1,
  hotkey: "INSERT",
};

// --- Title Bar ---
function TitleBar() {
  const appWindow = getCurrentWindow();

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    appWindow.startDragging();
  };

  return (
    <div className="title-bar" onMouseDown={handleMouseDown}>
      <span className="title-bar-title">noctis</span>
      <div className="title-bar-controls">
        <button className="title-bar-btn" onClick={() => appWindow.minimize()}>—</button>
        <button className="title-bar-btn close" onClick={() => appWindow.close()}>✕</button>
      </div>
    </div>
  );
}

// --- Visual Monitor Layout (like Windows Display Settings) ---
function MonitorLayout({ monitors, selected, onSelect }: {
  monitors: MonitorInfo[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  if (monitors.length === 0) return null;

  // Calculate bounds for scaling
  const minX = Math.min(...monitors.map(m => m.x));
  const minY = Math.min(...monitors.map(m => m.y));
  const maxX = Math.max(...monitors.map(m => m.x + m.width));
  const maxY = Math.max(...monitors.map(m => m.y + m.height));

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  // Scale to fit in container
  const containerWidth = 280;
  const containerHeight = 120;
  const scale = Math.min(containerWidth / totalWidth, containerHeight / totalHeight) * 0.8;

  return (
    <div className="monitor-layout-container">
      <div className="monitor-layout" style={{ width: containerWidth, height: containerHeight }}>
        {monitors.map(m => {
          const left = (m.x - minX) * scale + (containerWidth - totalWidth * scale) / 2;
          const top = (m.y - minY) * scale + (containerHeight - totalHeight * scale) / 2;
          const width = m.width * scale;
          const height = m.height * scale;

          return (
            <button
              key={m.index}
              className={`monitor-box ${m.index === selected ? "selected" : ""}`}
              style={{ left, top, width, height }}
              onClick={() => onSelect(m.index)}
            >
              {m.index}
            </button>
          );
        })}
      </div>
      <div className="monitor-info">
        {monitors.find(m => m.index === selected)?.width || 0} x {monitors.find(m => m.index === selected)?.height || 0}
      </div>
    </div>
  );
}

// --- Unified Single Screen View ---
function NoctisView({
  active,
  hotkey,
  onHotkeyChange,
  monitors,
  settings,
  onSettingsChange
}: {
  active: boolean;
  hotkey: string;
  onHotkeyChange: (key: string) => void;
  monitors: MonitorInfo[];
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      const displayName = e.key.length === 1 ? e.key.toUpperCase() : e.key.toUpperCase();
      onHotkeyChange(displayName);
      setListening(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [listening, onHotkeyChange]);

  return (
    <div className="noctis-view">
      {/* Status indicator */}
      <div className={`status-bar ${active ? "active" : ""}`}>
        <span className="status-dot" />
        <span className="status-text">{active ? "ACTIVE" : "INACTIVE"}</span>
      </div>

      {/* Monitor selection */}
      <div className="settings-section">
        <div className="section-label">TARGET MONITOR</div>
        <MonitorLayout
          monitors={monitors}
          selected={settings.monitorIndex}
          onSelect={(index) => onSettingsChange({ ...settings, monitorIndex: index })}
        />
      </div>

      {/* Hotkey */}
      <div className="hotkey-section">
        <span className="hotkey-label">Press</span>
        <button
          className={`hotkey-key ${listening ? "listening" : ""}`}
          onClick={() => setListening(true)}
        >
          {listening ? "..." : hotkey}
        </button>
        <span className="hotkey-label">to toggle</span>
      </div>
    </div>
  );
}

// --- App Root ---
function App() {
  const [active, setActive] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Load settings on mount
  useEffect(() => {
    // Try to load saved settings
    const saved = localStorage.getItem("noctis-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const loadedSettings = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(loadedSettings);
        // Register saved hotkey with backend
        invoke("set_hotkey", { key: loadedSettings.hotkey }).catch(console.error);
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    }
  }, []);

  // Save settings when they change
  const handleSettingsChange = (newSettings: Settings) => {
    // Reset gamma on old monitor before switching
    if (newSettings.monitorIndex !== settings.monitorIndex) {
      invoke("set_gamma", { value: 0, monitor: settings.monitorIndex }).catch(console.error);
    }
    setSettings(newSettings);
    localStorage.setItem("noctis-settings", JSON.stringify(newSettings));
  };

  // Handle hotkey change
  const handleHotkeyChange = (key: string) => {
    const newSettings = { ...settings, hotkey: key };
    setSettings(newSettings);
    localStorage.setItem("noctis-settings", JSON.stringify(newSettings));
    // Register the new hotkey with the backend
    invoke("set_hotkey", { key }).catch(console.error);
  };

  // Hotkey listener
  useEffect(() => {
    const unlisten = listen("toggle-system", () => setActive(p => !p));
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Fetch monitors
  useEffect(() => {
    invoke<MonitorInfo[]>("get_monitors").then(m => {
      setMonitors(m);
      // Set primary as default if no saved setting
      const saved = localStorage.getItem("noctis-settings");
      if (!saved) {
        const primary = m.find(x => x.is_primary);
        if (primary) {
          setSettings(s => ({ ...s, monitorIndex: primary.index }));
        }
      }
    }).catch(console.error);
  }, []);

  // ============================================================================
  // NIGHT VISION - ULTRA-STABLE AUTO-ADJUSTMENT
  // ============================================================================
  useEffect(() => {
    let interval: number | null = null;

    // State
    let currentLevel = 0;              // Current discrete intensity level (0, 1, or 2)
    let brightnessHistory: number[] = []; // Rolling buffer for noise reduction

    // Configuration
    const LEVELS = [0.0, 0.35, 0.60];  // Discrete intensity levels: Off, Medium, High
    const SAMPLE_COUNT = 3;            // Lower sample count for faster reaction
    const POLL_MS = 100;               // Poll fast (100ms) to catch dark scenes immediately
    const FADE_IN_STEP = 0.10;         // Fast fade in (10% per 100ms) - engage in ~0.5s
    const FADE_OUT_STEP = 0.02;        // Slow fade out (2% per 100ms) - disengage safely
    const DARK_THRESHOLD = 0.30;       // Darkness trigger
    const MID_THRESHOLD = 0.45;        // Medium light trigger
    const BRIGHT_THRESHOLD = 0.60;     // Brightness safety gap

    // Track applied value for smooth fading
    let appliedIntensity = 0.0;

    if (!active) {
      // Inactive: Reset all monitors
      monitors.forEach(m => {
        invoke("set_gamma", { value: 0.0, monitor: m.index }).catch(() => { });
      });
      invoke("disable_adjustment").catch(() => { });
      return;
    }

    // Active: Initialize
    const target = monitors.find(m => m.index === settings.monitorIndex);
    if (!target) return;

    // Dim secondary monitors once
    monitors.forEach(m => {
      if (m.index !== settings.monitorIndex) {
        invoke("dim_monitor", { brightness: 0.5, monitor: m.index }).catch(() => { });
      }
    });

    const tick = async () => {
      try {
        // 1. Sample brightness
        const sample = await invoke<number>("get_sensor_data", {
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height
        });

        // 2. Add to rolling buffer
        brightnessHistory.push(sample);
        if (brightnessHistory.length > SAMPLE_COUNT) {
          brightnessHistory.shift();
        }

        // 3. Calculate average brightness (noise reduction)
        const avgBrightness = brightnessHistory.reduce((a, b) => a + b, 0) / brightnessHistory.length;

        // 4. Determine target level based on thresholds
        let targetLevel = 0;
        if (avgBrightness < DARK_THRESHOLD) {
          targetLevel = 2; // High
        } else if (avgBrightness < MID_THRESHOLD) {
          targetLevel = 1; // Medium
        } else if (avgBrightness > BRIGHT_THRESHOLD) {
          targetLevel = 0; // Off
        } else {
          targetLevel = currentLevel; // Hysteresis: maintain current
        }

        // 5. Update level only if changed
        if (targetLevel !== currentLevel) {
          currentLevel = targetLevel;
        }

        // 6. Smooth fade toward target intensity
        const targetIntensity = LEVELS[currentLevel];
        if (Math.abs(appliedIntensity - targetIntensity) > 0.001) {
          if (appliedIntensity < targetIntensity) {
            // Fade In (Attack) - Fast
            appliedIntensity = Math.min(appliedIntensity + FADE_IN_STEP, targetIntensity);
          } else {
            // Fade Out (Decay) - Slow
            appliedIntensity = Math.max(appliedIntensity - FADE_OUT_STEP, targetIntensity);
          }

          // 7. Apply to monitor
          await invoke("set_gamma", {
            value: appliedIntensity,
            monitor: settings.monitorIndex
          });
        }

      } catch {
        // Silently ignore errors
      }
    };

    // Start loop
    tick();
    interval = window.setInterval(tick, POLL_MS);

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [active, settings.monitorIndex, monitors]);


  return (
    <div className="app-shell">
      <TitleBar />

      <div className="content-area">
        <NoctisView
          active={active}
          hotkey={settings.hotkey}
          onHotkeyChange={handleHotkeyChange}
          monitors={monitors}
          settings={settings}
          onSettingsChange={handleSettingsChange}
        />
      </div>
    </div>
  );
}

export default App;
