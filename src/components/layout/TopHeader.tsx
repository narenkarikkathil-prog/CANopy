import React from 'react';
import { useVehicle } from '../../context/VehicleContext';
import { useBLE } from '../../context/BLEContext';
import {
  IconCar,
  IconBatteryCharging,
  IconChevronRight,
  IconChevronDown,
  IconCalendar,
} from '@tabler/icons-react';
import { formatRecordingDuration } from '../../services/telemetryRecorder';
import type { NavTab } from './AppNav';

interface TopHeaderProps {
  activeTab: NavTab;
  onNavigateToConnection?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ activeTab, onNavigateToConnection }) => {
  const {
    vehicles,
    activeVehicleName,
    setActiveVehicleName,
    selectedYear,
    setSelectedYear,
    availableYears,
  } = useVehicle();
  const {
    status,
    isSimulated,
    batteryGuardActive,
    isRecording,
    recordingDuration,
  } = useBLE();

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          label: isSimulated ? 'Sim Connected' : 'Connected',
          dotColor: '#4C7A5A',
          pulse: false,
        };
      case 'connecting':
        return {
          label: 'Connecting...',
          dotColor: '#C98A3B',
          pulse: true,
        };
      case 'disconnected':
      default:
        return {
          label: 'Disconnected',
          dotColor: '#B5453A',
          pulse: false,
        };
    }
  };

  const statusConfig = getStatusConfig();

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Live Telemetry';
      case 'commands':
        return 'Commands';
      case 'ble':
        return 'Connection';
      case 'help':
        return 'Help & Guide';
    }
  };

  return (
    <header className="canopy-top-header">
      <div className="header-left">
        <h1 className="header-title serif-heading">{getPageTitle()}</h1>
      </div>

      <div className="header-status-area">
        {/* Active Telemetry Recording Indicator */}
        {isRecording && (
          <div className="header-recording-indicator" title="Telemetry recording in progress">
            <span className="header-recording-dot" />
            <span>REC {formatRecordingDuration(recordingDuration)}</span>
          </div>
        )}

        {/* 12V Battery Guard Indicator */}
        {batteryGuardActive && (
          <div className="battery-guard-indicator" title="12V battery voltage is low. Polling paused to prevent drain.">
            <IconBatteryCharging size={14} />
            <span>12V Guard</span>
          </div>
        )}

        {/* Minimalist Connection Indicator - Clickable to open connection page */}
        <button
          type="button"
          id="header-connection-indicator"
          className="header-connection-indicator"
          onClick={onNavigateToConnection}
          title={`Connection Status: ${statusConfig.label}. Click to open connection settings.`}
          aria-label={`Connection Status: ${statusConfig.label}. Click to open connection page.`}
        >
          <span
            className={`connection-dot ${statusConfig.pulse ? 'connection-pulse' : ''}`}
            style={{ backgroundColor: statusConfig.dotColor }}
          />
          <span className="connection-label">{statusConfig.label}</span>
          <IconChevronRight size={13} className="connection-arrow" aria-hidden="true" />
        </button>
      </div>

      <div className="header-selectors-area">
        {/* Unified Vehicle & Year Selector Pill - One shared control split in half */}
        <div className="split-vehicle-pill" role="group" aria-label="Vehicle profile and model year selection">
          {/* Left Half: Vehicle Profile */}
          <div className="split-pill-half split-pill-vehicle" title={`Vehicle: ${activeVehicleName}`}>
            <IconCar size={15} className="split-pill-icon" aria-hidden="true" />
            <select
              id="global-vehicle-selector"
              className="split-pill-select"
              value={activeVehicleName}
              onChange={(e) => setActiveVehicleName(e.target.value)}
              aria-label="Select Vehicle Profile"
            >
              {vehicles.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
            <IconChevronDown size={13} className="split-pill-chevron" aria-hidden="true" />
          </div>

          {/* Symmetrical Vertical Divider */}
          <div className="split-pill-divider" aria-hidden="true" />

          {/* Right Half: Model Year */}
          <div
            className="split-pill-half split-pill-year"
            title={`Model Year: ${selectedYear === 'all' ? 'All Years' : selectedYear}`}
          >
            <IconCalendar size={13} className="split-pill-icon" aria-hidden="true" />
            <select
              id="global-year-selector"
              className="split-pill-select"
              value={selectedYear}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedYear(val === 'all' ? 'all' : parseInt(val, 10));
              }}
              aria-label="Select Model Year"
            >
              {availableYears.length > 1 ? (
                availableYears.map((yr) => (
                  <option key={yr.toString()} value={yr}>
                    {yr === 'all' ? 'All Years' : yr}
                  </option>
                ))
              ) : (
                <option value={selectedYear}>
                  {selectedYear === 'all' ? 'All Years' : selectedYear}
                </option>
              )}
            </select>
            <IconChevronDown size={13} className="split-pill-chevron" aria-hidden="true" />
          </div>
        </div>
      </div>
    </header>
  );
};
