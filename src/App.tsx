import React, { useState } from 'react';
import { VehicleProvider } from './context/VehicleContext';
import { WidgetProvider } from './context/WidgetContext';
import { BLEProvider } from './context/BLEContext';
import { AppNav, type NavTab } from './components/layout/AppNav';
import { TopHeader } from './components/layout/TopHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { CommandsView } from './components/commands/CommandsView';
import { BLEConnectionView } from './components/ble/BLEConnectionView';
import { HelpView } from './components/help/HelpView';

export const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  return (
    <div className="canopy-app-layout">
      {/* Responsive Navigation: Bottom Bar on mobile (<640px), Left Sidebar on landscape/tablet/desktop (≥640px) */}
      <AppNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="canopy-main-wrapper">
        <TopHeader activeTab={activeTab} />
        <main className="canopy-content-container">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'commands' && <CommandsView />}
          {activeTab === 'ble' && <BLEConnectionView />}
          {activeTab === 'help' && <HelpView />}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <VehicleProvider>
      <WidgetProvider>
        <BLEProvider>
          <AppContent />
        </BLEProvider>
      </WidgetProvider>
    </VehicleProvider>
  );
};

export default App;
