import React from 'react';
import {
  IconGauge,
  IconDatabase,
  IconBluetooth,
  IconHelp,
  type IconProps,
} from '@tabler/icons-react';

export type NavTab = 'dashboard' | 'commands' | 'ble' | 'help';

interface AppNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

interface NavItemConfig {
  id: NavTab;
  label: string;
  icon: React.ComponentType<IconProps>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconGauge },
  { id: 'commands', label: 'Commands & Data', icon: IconDatabase },
  { id: 'ble', label: 'BLE Connection', icon: IconBluetooth },
  { id: 'help', label: 'Help & Guide', icon: IconHelp },
];

export const AppNav: React.FC<AppNavProps> = ({ activeTab, onSelectTab }) => {
  return (
    <nav className="canopy-nav" aria-label="Main Navigation">
      <div className="nav-brand">
        <div className="brand-logo">
          <svg width="26" height="26" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="10" fill="#2A2420" />
            <path d="M7 21 C7 13 13 8 25 8 C25 16 20 21 12 21 Z" fill="#BC9A70" />
            <circle cx="16" cy="18" r="3" fill="#FFFFFF" />
            <path d="M16 18 L21 13" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="brand-text">
          <span className="brand-title serif-heading">Canopy</span>
          <span className="brand-subtitle">Telemetry & OBD</span>
        </div>
      </div>

      <div className="nav-items-container">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="nav-icon-wrapper">
                <Icon size={20} stroke={isActive ? 2.2 : 1.7} />
              </div>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
