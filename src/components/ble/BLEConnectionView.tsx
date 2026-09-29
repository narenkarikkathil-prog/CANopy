import React from 'react';
import { useBLE } from '../../context/BLEContext';
import { ATConsole } from './ATConsole';
import {
  IconBluetooth,
  IconRefresh,
  IconPower,
  IconCpu,
  IconCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';

export const BLEConnectionView: React.FC = () => {
  const {
    status,
    connect,
    disconnect,
    quickReconnect,
    isSimulated,
    setIsSimulated,
  } = useBLE();

  const hasWebBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  return (
    <div className="ble-view-container">
      {/* Primary Connection Status Card */}
      <div className="card ble-card">
        <div className="ble-card-header">
          <div className="ble-header-info">
            <div className={`ble-header-icon-box status-${status}`}>
              <IconBluetooth size={28} />
            </div>
            <div>
              <h2 className="section-title serif-heading">Bluetooth LE Connection</h2>
              <p className="section-subtitle">
                Targeting Nordic UART Service <code>6e400001-b5a3-f393-e0a9-e50e24dcca9e</code>
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
                    : 'Adapter Connected'
                  : status === 'connecting'
                  ? 'Connecting & Initializing...'
                  : 'Disconnected'}
              </span>
            </span>
          </div>
        </div>

        {/* Init Sequence Protocol Flow Display */}
        <div className="ble-protocol-steps">
          <div className="protocol-step">
            <span className="step-num">1</span>
            <span className="step-cmd">AT Z</span>
            <span className="step-desc">Reset ELM327</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">2</span>
            <span className="step-cmd">AT SP 6</span>
            <span className="step-desc">ISO 15765-4 CAN 11/500</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">3</span>
            <span className="step-cmd">AT H1</span>
            <span className="step-desc">CAN Headers ON</span>
          </div>
        </div>

        {/* Browser Support Alert */}
        {!hasWebBluetooth && !isSimulated && (
          <div className="csv-alert csv-error-box">
            <IconAlertTriangle size={20} className="alert-icon" />
            <div>
              <strong>Web Bluetooth is not available in this browser.</strong>
              <p>
                Native Web Bluetooth requires Google Chrome, Microsoft Edge, or the Bluefy browser on iOS.
                You can also enable <strong>Simulator Mode</strong> below to test telemetry immediately.
              </p>
            </div>
          </div>
        )}

        {/* Controls Action Row */}
        <div className="ble-controls-row">
          {status === 'disconnected' ? (
            <button
              type="button"
              className="btn-primary btn-large"
              onClick={connect}
            >
              <IconBluetooth size={20} />
              <span>{isSimulated ? 'Start Simulator' : 'Pair & Connect Adapter'}</span>
            </button>
          ) : (
            <div className="active-connection-buttons">
              <button
                type="button"
                className="btn-primary"
                onClick={quickReconnect}
                disabled={status === 'connecting'}
              >
                <IconRefresh size={18} />
                <span>Quick-Reconnect (Re-run Init)</span>
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
          <div className="simulator-toggle-wrapper">
            <label className="toggle-label" htmlFor="simulator-checkbox">
              <input
                id="simulator-checkbox"
                type="checkbox"
                checked={isSimulated}
                onChange={(e) => setIsSimulated(e.target.checked)}
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
      </div>

      {/* Live AT Console Component */}
      <ATConsole />
    </div>
  );
};
