import React, { useState } from 'react';
import { useBLE } from '../../context/BLEContext';
import { ATConsole } from './ATConsole';
import type { ConnectionMode } from '../../types/ble';
import {
  IconBluetooth,
  IconPlugConnected,
  IconDeviceUsb,
  IconRefresh,
  IconPower,
  IconCpu,
  IconCheck,
  IconTrash,
  IconGauge,
  IconAlertTriangle,
  IconInfoCircle,
  IconBolt,
  IconRotateClockwise,
  IconMinus,
  IconPlus,
} from '@tabler/icons-react';

interface BLEConnectionViewProps {
  onNavigateToHelp?: () => void;
}

export const BLEConnectionView: React.FC<BLEConnectionViewProps> = () => {
  const {
    status,
    connectionType,
    deviceName,
    connectBLE,
    connectClassic,
    connectUSB,
    forgetSavedDevices,
    disconnect,
    quickReconnect,
    isSimulated,
    setIsSimulated,
    isBLESupported,
    isSerialSupported,
    pollingRateHz,
    setPollingRateHz,
    actualRateHz,
    rateRationale,
    isCustomRate,
    benchmarkAdapterSpeed,
    resetToScientificDefault,
    lastBenchmark,
  } = useBLE();

  const [selectedMode, setSelectedModeState] = useState<ConnectionMode>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('obd_connection_mode') as ConnectionMode;
      if (saved && (saved === 'ble' || saved === 'classic' || saved === 'usb')) return saved;
    }
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return isMobile ? 'ble' : 'classic';
  });

  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [benchmarkNotice, setBenchmarkNotice] = useState<string | null>(null);

  const handleBenchmark = async () => {
    setIsBenchmarking(true);
    setBenchmarkNotice(null);
    try {
      const res = await benchmarkAdapterSpeed();
      if (res) {
        setBenchmarkNotice(
          `Benchmark: ${res.latencyMs}ms avg latency. Hardware max: ${res.maxRateHz} req/s. Safe recommended: ${res.recommendedRateHz} req/s.`
        );
        setTimeout(() => setBenchmarkNotice(null), 8000);
      }
    } finally {
      setIsBenchmarking(false);
    }
  };

  const setSelectedMode = (mode: ConnectionMode) => {
    setSelectedModeState(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('obd_connection_mode', mode);
    }
  };

  React.useEffect(() => {
    if (isSimulated) {
      setSelectedMode('ble');
    }
  }, [isSimulated]);

  const [forgetNotice, setForgetNotice] = useState<string | null>(null);

  const handleConnect = (forceNew = false) => {
    if (isSimulated || selectedMode === 'ble') {
      connectBLE();
    } else if (selectedMode === 'classic') {
      connectClassic(forceNew);
    } else {
      connectUSB(forceNew);
    }
  };

  const handleForgetDevices = async () => {
    try {
      const count = await forgetSavedDevices();
      setForgetNotice(
        count > 0
          ? `Cleared ${count} saved device permission(s).`
          : 'No saved devices found in browser permissions.'
      );
      setTimeout(() => setForgetNotice(null), 4000);
    } catch (err: any) {
      setForgetNotice(`Failed to clear: ${err.message}`);
      setTimeout(() => setForgetNotice(null), 4000);
    }
  };

  const isModeSupported =
    isSimulated ||
    (selectedMode === 'ble' && isBLESupported) ||
    ((selectedMode === 'classic' || selectedMode === 'usb') && isSerialSupported);

  return (
    <div className="ble-view-container">
      {/* Primary Connection Card */}
      <div className="card ble-card">
        <div className="ble-card-header">
          <div className="ble-header-info">
            <div className={`ble-header-icon-box status-${status}`}>
              {connectionType === 'usb' || selectedMode === 'usb' ? (
                <IconDeviceUsb size={26} />
              ) : connectionType === 'classic' || selectedMode === 'classic' ? (
                <IconPlugConnected size={26} />
              ) : (
                <IconBluetooth size={26} />
              )}
            </div>
            <div>
              <h2 className="section-title serif-heading">OBD-II Connection</h2>
              <p className="section-subtitle">
                Connect via BLE, BT, or USB
              </p>
            </div>
          </div>

          <div className="ble-header-status-pill">
            <span
              className={`ble-status-pill status-${status}`}
              style={{
                backgroundColor:
                  status === 'connected'
                    ? 'rgba(76, 122, 90, 0.15)'
                    : status === 'connecting'
                    ? 'rgba(201, 138, 59, 0.15)'
                    : 'rgba(181, 69, 58, 0.15)',
                color:
                  status === 'connected'
                    ? 'var(--color-success)'
                    : status === 'connecting'
                    ? 'var(--color-warning)'
                    : 'var(--color-error)',
                borderColor:
                  status === 'connected'
                    ? 'var(--color-success)'
                    : status === 'connecting'
                    ? 'var(--color-warning)'
                    : 'var(--color-error)',
              }}
            >
              <span
                className={`ble-dot ${status === 'connecting' ? 'ble-pulse' : ''}`}
                style={{
                  backgroundColor:
                    status === 'connected'
                      ? 'var(--color-success)'
                      : status === 'connecting'
                      ? 'var(--color-warning)'
                      : 'var(--color-error)',
                }}
              />
              <span className="ble-text">
                {status === 'connected'
                  ? isSimulated
                    ? 'Simulated Adapter Active'
                    : deviceName
                    ? `${deviceName} (${connectionType === 'usb' ? 'USB' : connectionType === 'classic' ? 'BT' : 'BLE'})`
                    : 'Adapter Connected'
                  : status === 'connecting'
                  ? 'Connecting...'
                  : 'Disconnected'}
              </span>
            </span>
          </div>
        </div>

        {/* Connection Action Controls */}
        {status === 'disconnected' ? (
          <div className="connection-selector-panel">
            <div className="connection-toggle-row">
              <span className="connection-toggle-label">Mode:</span>
              <div className="segmented-control connection-mode-segmented">
                <button
                  type="button"
                  className={selectedMode === 'ble' ? 'active' : ''}
                  onClick={() => setSelectedMode('ble')}
                >
                  <IconBluetooth size={15} style={{ marginRight: 6 }} />
                  BLE
                </button>
                <button
                  type="button"
                  className={selectedMode === 'classic' ? 'active' : ''}
                  onClick={() => setSelectedMode('classic')}
                >
                  <IconPlugConnected size={15} style={{ marginRight: 6 }} />
                  BT
                </button>
                <button
                  type="button"
                  className={selectedMode === 'usb' ? 'active' : ''}
                  onClick={() => setSelectedMode('usb')}
                >
                  <IconDeviceUsb size={15} style={{ marginRight: 6 }} />
                  USB
                </button>
              </div>
            </div>

            <div className="connection-action-box">
              <div className="connection-buttons-group">
                <button
                  type="button"
                  className="btn-primary connect-main-btn"
                  onClick={() => handleConnect(false)}
                  disabled={!isModeSupported}
                >
                  {selectedMode === 'classic' ? (
                    <IconPlugConnected size={20} />
                  ) : selectedMode === 'usb' ? (
                    <IconDeviceUsb size={20} />
                  ) : (
                    <IconBluetooth size={20} />
                  )}
                  <span>
                    {isSimulated
                      ? 'Connect (BLE)'
                      : selectedMode === 'ble'
                      ? 'Connect (BLE)'
                      : selectedMode === 'classic'
                      ? 'Connect (BT)'
                      : 'Connect (USB)'}
                  </span>
                </button>

                {!isSimulated && (selectedMode === 'classic' || selectedMode === 'usb') && (
                  <div className="connection-secondary-actions">
                    <button
                      type="button"
                      className="connect-sub-btn choose-new-btn"
                      onClick={() => handleConnect(true)}
                      title="Open device chooser to select or pair a new device"
                    >
                      <IconRefresh size={14} />
                      <span>Select New Device</span>
                    </button>

                    <button
                      type="button"
                      className="connect-sub-btn forget-btn"
                      onClick={handleForgetDevices}
                      title="Forget saved serial/Bluetooth device permissions"
                    >
                      <IconTrash size={14} />
                      <span>Forget Devices</span>
                    </button>
                  </div>
                )}
              </div>

              {forgetNotice && (
                <div className="forget-msg-pill">
                  <IconCheck size={14} />
                  <span>{forgetNotice}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="active-connection-buttons">
            <button
              type="button"
              className="btn-primary"
              onClick={quickReconnect}
              disabled={status === 'connecting'}
            >
              <IconRefresh size={18} />
              <span>Quick-Reconnect</span>
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={disconnect}
            >
              <IconPower size={18} />
              <span>Disconnect</span>
            </button>
          </div>
        )}

        {/* Simulator Toggle */}
        <div className="simulator-toggle-wrapper" style={{ marginTop: 20 }}>
          <label className="toggle-label" htmlFor="simulator-checkbox">
            <input
              id="simulator-checkbox"
              type="checkbox"
              checked={isSimulated}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsSimulated(checked);
                if (checked) {
                  setSelectedMode('ble');
                }
              }}
            />
            <span className="toggle-custom-box">
              {isSimulated && <IconCheck size={14} stroke={3} />}
            </span>
            <span className="toggle-text">
              <IconCpu size={16} />
              <span>Simulate Adapter (Offline Demo)</span>
            </span>
          </label>
        </div>
      </div>

      {/* Data Collection Rate Configuration Card */}
      <div className="card data-rate-card" role="region" aria-label="OBD-II Data Collection Rate">
        <div className="data-rate-header">
          <div className="data-rate-title-group">
            <div className="data-rate-icon-box">
              <IconGauge size={22} />
            </div>
            <div>
              <h2 className="section-title serif-heading">Data Collection Rate</h2>
              <p className="section-subtitle">
                How many times per second the OBD reader is queried for sensor data
              </p>
            </div>
          </div>

          <div className="data-rate-badges-group">
            <span className="data-rate-target-badge" title="Target querying frequency">
              <strong>{pollingRateHz}</strong> req/s
              <span className="data-rate-ms-sub"> (~{Math.round(1000 / pollingRateHz)} ms)</span>
            </span>

            {status === 'connected' && (
              <span
                className={`data-rate-live-pill ${actualRateHz > 0 ? 'active' : ''}`}
                title="Actual measured request throughput in real-time"
              >
                <span className="live-rate-dot" />
                <span>Live: <strong>{actualRateHz}</strong> req/s</span>
              </span>
            )}
          </div>
        </div>

        {/* Rate Presets Segmented Buttons */}
        <div className="data-rate-presets-section">
          <span className="data-rate-label">Frequency Presets:</span>
          <div className="data-rate-presets-pills">
            {[
              { hz: 2, label: '2 Hz', note: 'Eco / Battery' },
              { hz: 5, label: '5 Hz', note: 'Conservative' },
              { hz: 10, label: '10 Hz', note: 'Default' },
              { hz: 15, label: '15 Hz', note: 'Fast' },
              { hz: 20, label: '20 Hz', note: 'STN / Ultra' },
            ].map((preset) => {
              const isSelected = pollingRateHz === preset.hz;
              return (
                <button
                  key={preset.hz}
                  type="button"
                  className={`rate-preset-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => setPollingRateHz(preset.hz, true)}
                >
                  <span className="preset-hz">{preset.label}</span>
                  <span className="preset-note">{preset.note}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Slider & Stepper */}
        <div className="data-rate-slider-row">
          <button
            type="button"
            className="rate-step-btn"
            onClick={() => setPollingRateHz(Math.max(1, pollingRateHz - 1), true)}
            aria-label="Decrease rate by 1 req/s"
            disabled={pollingRateHz <= 1}
          >
            <IconMinus size={15} />
          </button>

          <div className="rate-slider-wrapper">
            <input
              type="range"
              id="polling-rate-slider"
              className="canopy-range-slider"
              min={1}
              max={30}
              step={1}
              value={pollingRateHz}
              onChange={(e) => setPollingRateHz(parseInt(e.target.value, 10), true)}
              aria-label="Data collection rate slider"
            />
            <div className="slider-ticks">
              <span>1 Hz</span>
              <span>10 Hz (Default)</span>
              <span>20 Hz</span>
              <span>30 Hz</span>
            </div>
          </div>

          <button
            type="button"
            className="rate-step-btn"
            onClick={() => setPollingRateHz(Math.min(30, pollingRateHz + 1), true)}
            aria-label="Increase rate by 1 req/s"
            disabled={pollingRateHz >= 30}
          >
            <IconPlus size={15} />
          </button>
        </div>

        {/* Warning Callouts */}
        {pollingRateHz > 12 && (
          <div className="rate-alert-banner warning" role="alert">
            <IconAlertTriangle size={18} className="rate-alert-icon" />
            <div className="rate-alert-text">
              <strong>High Polling Rate Warning:</strong> Querying faster than 12–15 times per second can saturate internal buffer memory on standard ELM327 adapters or cause CAN bus arbitration timeouts on certain vehicles. If sensor readings freeze or disconnect, reduce to 5–10 req/s.
            </div>
          </div>
        )}

        {pollingRateHz <= 2 && (
          <div className="rate-alert-banner info" role="status">
            <IconInfoCircle size={18} className="rate-alert-icon" />
            <div className="rate-alert-text">
              <strong>Low Polling Rate:</strong> Data is queried every 500 ms or slower. Recommended for reducing phone battery and vehicle bus load during long highway trips.
            </div>
          </div>
        )}

        {/* Scientific Hardware Profile & Benchmark Controls */}
        <div className="rate-scientific-card">
          <div className="rate-scientific-header">
            <div className="rate-scientific-title">
              <IconCpu size={16} />
              <span>Scientific Hardware Profile</span>
            </div>
            {isCustomRate && (
              <button
                type="button"
                className="btn-ghost rate-reset-btn"
                onClick={resetToScientificDefault}
                title="Reset to scientifically calculated default for this hardware"
              >
                <IconRotateClockwise size={13} />
                <span>Reset to Default</span>
              </button>
            )}
          </div>

          <p className="rate-scientific-rationale">{rateRationale}</p>

          <div className="rate-benchmark-actions">
            <button
              type="button"
              className="btn-secondary rate-benchmark-btn"
              onClick={handleBenchmark}
              disabled={status !== 'connected' || isBenchmarking}
              title={status !== 'connected' ? 'Connect an adapter to benchmark exchange rate' : 'Send 3 probe commands to measure hardware latency'}
            >
              <IconBolt size={15} />
              <span>{isBenchmarking ? 'Testing Exchange Rate...' : 'Benchmark Adapter Speed'}</span>
            </button>

            {status !== 'connected' && (
              <span className="benchmark-offline-hint">
                Connect adapter to run live speed benchmark
              </span>
            )}
          </div>

          {benchmarkNotice && (
            <div className="rate-benchmark-pill" role="status">
              <IconCheck size={14} />
              <span>{benchmarkNotice}</span>
            </div>
          )}

          {lastBenchmark && (
            <div className="rate-last-benchmark-stats">
              <span>Avg Latency: <strong>{lastBenchmark.latencyMs} ms</strong></span>
              <span className="stat-sep">•</span>
              <span>Hardware Max: <strong>{lastBenchmark.maxRateHz} req/s</strong></span>
              <span className="stat-sep">•</span>
              <span>Safe Recommended: <strong>{lastBenchmark.recommendedRateHz} req/s</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Live AT Console Component */}
      <ATConsole />
    </div>
  );
};
