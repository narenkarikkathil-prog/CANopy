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
  IconTrash,
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
    forgetSavedDevices,
    disconnect,
    quickReconnect,
    isSimulated,
    setIsSimulated,
    isBLESupported,
    isSerialSupported,
  } = useBLE();

  const [selectedMode, setSelectedModeState] = useState<ConnectionMode>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('obd_connection_mode') as ConnectionMode;
      if (saved && (saved === 'ble' || saved === 'classic' || saved === 'usb')) return saved;
    }
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return isMobile ? 'ble' : 'classic';
  });

  const setSelectedMode = (mode: ConnectionMode) => {
    setSelectedModeState(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('obd_connection_mode', mode);
    }
  };

  // When offline simulation is enabled, automatically switch connection mode to BLE
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
          ? `Cleared ${count} saved device permission(s). You can select your adapter cleanly.`
          : 'No saved devices found in browser permissions.'
      );
      setTimeout(() => setForgetNotice(null), 5000);
    } catch (err: any) {
      setForgetNotice(`Failed to clear: ${err.message}`);
      setTimeout(() => setForgetNotice(null), 5000);
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
            <span className="step-cmd">\r / AT WS</span>
            <span className="step-desc">Sync &amp; Warm Start</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">2</span>
            <span className="step-cmd">AT E0 / H1</span>
            <span className="step-desc">Echo Off &amp; Headers</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">3</span>
            <span className="step-cmd">AT SP 6</span>
            <span className="step-desc">Protocol Lock-in</span>
          </div>
          <div className="protocol-step-arrow">→</div>
          <div className="protocol-step">
            <span className="step-num">4</span>
            <span className="step-cmd">ATI / STI</span>
            <span className="step-desc">Caps &amp; STN Probe</span>
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

        {/* macOS OBDLink MX+ Tip */}
        {!isSimulated && (
          <div className="connection-ios-note" style={{ marginTop: 8 }}>
            <IconInfoCircle size={18} className="ios-note-icon" />
            <span>
              <strong>macOS OBDLink MX+ Tip:</strong> Pair your adapter in <strong>macOS System Settings &gt; Bluetooth</strong> first, then select <strong>Bluetooth</strong> to choose your <code>cu.OBDLinkMX...</code> serial port.
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
              <div className="connection-buttons-group">
                <button
                  type="button"
                  className="btn-primary connect-main-btn"
                  onClick={() => handleConnect(false)}
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

                {!isSimulated && (selectedMode === 'classic' || selectedMode === 'usb') && (
                  <div className="connection-secondary-actions">
                    <button
                      type="button"
                      className="connect-sub-btn choose-new-btn"
                      onClick={() => handleConnect(true)}
                      title="Open device chooser to select or pair a new device"
                    >
                      <IconRefresh size={14} />
                      <span>Select / Pair New Device</span>
                    </button>

                    <button
                      type="button"
                      className="connect-sub-btn forget-btn"
                      onClick={handleForgetDevices}
                      title="Revoke and forget all saved serial/Bluetooth device permissions in this browser"
                    >
                      <IconTrash size={14} />
                      <span>Forget Saved Devices</span>
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

              {!isSimulated && selectedMode === 'classic' && (
                <div className="classic-guide-card">
                  <div className="classic-guide-header">
                    <IconInfoCircle size={15} />
                    <span>macOS Bluetooth Serial Connection Guide</span>
                  </div>
                  <ul className="classic-guide-steps">
                    <li>
                      <strong>1. Pair in macOS First:</strong> Pair <code>OBDLink MX+</code> in <em>System Settings → Bluetooth</em> so macOS generates the virtual serial port.
                    </li>
                    <li>
                      <strong>2. Select the <code>cu.</code> Port:</strong> In the browser chooser, select <strong>cu.OBDLinkMX...</strong> (do not select <code>cu.Bluetooth-Incoming-Port</code> or <code>debug-console</code>).
                    </li>
                    <li>
                      <strong>3. Clearing Phantom Devices:</strong> If Chrome still shows an old ghost Bluetooth entry from previous sessions, click the tune/lock icon next to the URL in the address bar → <em>Reset permissions</em>, or visit <code>chrome://settings/content/serialPorts</code>.
                    </li>
                  </ul>
                </div>
              )}
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
