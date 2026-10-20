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

      {/* Live AT Console Component */}
      <ATConsole />
    </div>
  );
};
