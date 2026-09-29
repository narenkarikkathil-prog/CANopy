import React from 'react';
import { useVehicle } from '../../context/VehicleContext';
import { useBLE } from '../../context/BLEContext';
import { IconCar, IconRefresh, IconBatteryCharging } from '@tabler/icons-react';
import type { NavTab } from './AppNav';

interface TopHeaderProps {
  activeTab: NavTab;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ activeTab }) => {
  const {
    vehicles,
    activeVehicleName,
    setActiveVehicleName,
    selectedYear,
    setSelectedYear,
    availableYears,
  } = useVehicle();
  const { status, quickReconnect, isSimulated, batteryGuardActive } = useBLE();

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
        return 'Commands & Data';
      case 'ble':
        return 'BLE Connection';
      case 'help':
        return 'Help & Guide';
    }
  };

  return (
    <header className="canopy-top-header">
      <div className="header-left">
        <h1 className="header-title serif-heading">{getPageTitle()}</h1>
      </div>

      <div className="header-right">
        {/* 12V Battery Guard Indicator */}
        {batteryGuardActive && (
          <div className="battery-guard-indicator" title="12V battery voltage is low. Polling paused to prevent drain.">
            <IconBatteryCharging size={14} />
            <span>12V Guard</span>
          </div>
        )}

        {/* Simplified clean white rounded vehicle dropdown */}
        <div className="vehicle-selector-wrapper">
          <IconCar size={16} className="vehicle-icon" />
          <select
            id="global-vehicle-selector"
            className="vehicle-dropdown-clean"
            value={activeVehicleName}
            onChange={(e) => setActiveVehicleName(e.target.value)}
            aria-label="Select Active Vehicle Profile"
          >
            {vehicles.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Year Selector */}
        {availableYears.length > 1 && (
          <div className="year-selector-wrapper">
            <select
              id="global-year-selector"
              className="vehicle-dropdown-clean year-dropdown-clean"
              value={selectedYear}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedYear(val === 'all' ? 'all' : parseInt(val, 10));
              }}
              aria-label="Select Model Year"
            >
              {availableYears.map((yr) => (
                <option key={yr.toString()} value={yr}>
                  {yr === 'all' ? 'All Years' : yr}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Minimalist BLE Status: small status dot + muted text */}
        <button
          type="button"
          id="ble-status-badge"
          className="ble-status-minimal"
          onClick={quickReconnect}
          title="Tap to quick-reconnect OBD-II adapter"
          aria-label={`BLE Status: ${statusConfig.label}. Tap to quick-reconnect.`}
        >
          <span
            className={`ble-status-dot ${statusConfig.pulse ? 'ble-pulse' : ''}`}
            style={{ backgroundColor: statusConfig.dotColor }}
          />
          <span className="ble-status-label">{statusConfig.label}</span>
          <IconRefresh size={12} className="reconnect-hint-icon" />
        </button>
      </div>
    </header>
  );
};
