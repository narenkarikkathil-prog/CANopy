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
  IconAlertTriangle,
  IconInfoCircle,
} from '@tabler/icons-react';

interface BLEConnectionViewProps {
  onNavigateToHelp?: () => void;
}

export const BLEConnectionView: React.FC<BLEConnectionViewProps> = ({ onNavigateToHelp }) => {
  const {
    status,
    connectionType,
    deviceName,
    connectBLE,
    connectClassic,
    connectUSB,
    disconnect,
    quickReconnect,
    isSimulated,
    setIsSimulated,
    isBLESupported,
    isSerialSupported,
  } = useBLE();

  const [selectedMode, setSelectedMode] = useState<ConnectionMode>('ble');

  // When offline simulation is enabled, automatically switch connection mode to BLE
  React.useEffect(() => {
    if (isSimulated) {
      setSelectedMode('ble');
    }
  }, [isSimulated]);

  const handleConnect = () => {
    if (isSimulated || selectedMode === 'ble') {
      connectBLE();
    } else if (selectedMode === 'classic') {
      connectClassic();
    } else {
      connectUSB();
    }
  };

  const isModeSupported =
    isSimulated ||
    (selectedMode === 'ble' && isBLESupported) ||
    ((selectedMode === 'classic' || selectedMode === 'usb') && isSerialSupported);

  return (
    <div className="ble-view-container">
      {/* Primary Connection Status Card */}
      <div className="card ble-card">
        <div className="ble-card-header">
          <div className="ble-header-info">
            <div className={`ble-header-icon-box status-${status}`}>
              {connectionType === 'usb' ? (
                <IconDeviceUsb size={28} />
              ) : connectionType === 'classic' || connectionType === 'serial' ? (
                <IconPlugConnected size={28} />
              ) : (
                <IconBluetooth size={28} />
              )}
            </div>
            <div>
              <h2 className="section-title serif-heading">OBD-II Wireless &amp; Serial Interface</h2>
              <p className="section-subtitle">
                Connect your vehicle adapter via Bluetooth LE, Bluetooth Classic, or USB Serial
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
                    ? `${deviceName} (${connectionType === 'usb' ? 'USB' : connectionType === 'classic' ? 'BT Classic' : 'BLE'})`
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
            <span className="step-desc">Reset Controller</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">2</span>
            <span className="step-cmd">AT E0</span>
            <span className="step-desc">Echo Off</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">3</span>
            <span className="step-cmd">AT SP 6</span>
            <span className="step-desc">CAN 11-bit / 500k</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">4</span>
            <span className="step-cmd">AT H1</span>
            <span className="step-desc">CAN Headers ON</span>
          </div>
        </div>

        {/* Clean iPhone / iOS Notice */}
        {!isSimulated && (
          <div className="connection-ios-note">
            <IconInfoCircle size={18} className="ios-note-icon" />
            <span>
              <strong>iPhone &amp; iPad Notice:</strong> On iPhones and iPads, only <strong>BLE</strong> (Bluetooth Low Energy) is supported via Web BLE browsers like <em>Bluefy</em>. Bluetooth Classic and USB require desktop Chrome or Edge.
            </span>
          </div>
        )}

        {/* Browser Support Alerts (if unsupported) */}
        {!isBLESupported && !isSerialSupported && !isSimulated && (
          <div className="csv-alert csv-error-box" style={{ marginBottom: 20 }}>
            <IconAlertTriangle size={20} className="alert-icon" />
            <div>
              <strong>Web Bluetooth &amp; Web Serial are not supported in this browser.</strong>
              <p>
                Native communication requires Google Chrome, Microsoft Edge, or the Bluefy browser on iOS.
                You can toggle <strong>Simulate Adapter</strong> below to preview live telemetry immediately.
              </p>
            </div>
          </div>
        )}

        {/* Connection Action Controls */}
        {status === 'disconnected' ? (
          <div className="connection-selector-panel">
            <div className="connection-toggle-row">
              <span className="connection-toggle-label">Connection Mode:</span>
              <div className="segmented-control connection-mode-segmented">
                {isSimulated ? (
                  <button
                    type="button"
                    className="active"
                    onClick={() => setSelectedMode('ble')}
                    title="Simulating a Bluetooth Low Energy (BLE) adapter"
                  >
                    <IconBluetooth size={15} style={{ marginRight: 6 }} />
                    Connect (BLE)
                  </button>
                ) : (
                  <>
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
                      Bluetooth
                    </button>
                    <button
                      type="button"
                      className={selectedMode === 'usb' ? 'active' : ''}
                      onClick={() => setSelectedMode('usb')}
                    >
                      <IconDeviceUsb size={15} style={{ marginRight: 6 }} />
                      USB
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Mode-specific hints and connect button */}
            <div className="connection-action-box">
              <button
                type="button"
                className="btn-primary connect-main-btn"
                onClick={handleConnect}
                disabled={!isModeSupported}
              >
                {(!isSimulated && selectedMode === 'classic') ? (
                  <IconPlugConnected size={20} />
                ) : (!isSimulated && selectedMode === 'usb') ? (
                  <IconDeviceUsb size={20} />
                ) : (
                  <IconBluetooth size={20} />
                )}
                <span>
                  {isSimulated
                    ? 'Connect (BLE)'
                    : selectedMode === 'ble'
                    ? 'Connect via Bluetooth LE (BLE)'
                    : selectedMode === 'classic'
                    ? 'Connect via Bluetooth Classic (SPP)'
                    : 'Connect via USB Serial Cable'}
                </span>
              </button>

              <div className="connection-mode-desc">
                {isSimulated ? (
                  <span>
                    Simulating a <strong>Bluetooth Low Energy (BLE)</strong> OBD-II adapter with live vehicle telemetry.
                  </span>
                ) : selectedMode === 'ble' ? (
                  <span>
                    Supported: <strong>OBDLink MX+ (in BLE mode)</strong>, <strong>OBDLink CX</strong>, <strong>Veepeak</strong>, <strong>Vgate</strong>, <strong>Carista</strong>, and iPhone/iPad.
                  </span>
                ) : selectedMode === 'classic' ? (
                  <span>
                    Supported: <strong>OBDLink MX+</strong>, <strong>OBDLink LX</strong>, <strong>vLinker</strong>. <em>(Pair in OS Bluetooth Settings first).</em>
                  </span>
                ) : (
                  <span>
                    Supported: <strong>OBDLink EX / SX</strong> and <strong>FTDI / CH340</strong> diagnostic cables on desktop.
                  </span>
                )}
              </div>
            </div>

            {/* Helper link to Help Section */}
            {onNavigateToHelp && (
              <div className="connection-help-link-wrapper">
                <button
                  type="button"
                  className="connection-help-link"
                  onClick={onNavigateToHelp}
                >
                  View full list of supported dongles and hardware setup in Help &amp; Guide →
                </button>
              </div>
            )}
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
        <div className="simulator-toggle-wrapper" style={{ marginTop: 22 }}>
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

      {/* Live AT Console Component */}
      <ATConsole />
    </div>
  );
};
