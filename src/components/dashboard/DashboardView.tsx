import React, { useState } from 'react';
import { useWidgets } from '../../context/WidgetContext';
import { useVehicle } from '../../context/VehicleContext';
import { useBLE } from '../../context/BLEContext';
import { WidgetCard } from './WidgetCard';
import { WidgetConfigModal } from './WidgetConfigModal';
import { CustomCommandDrawer } from './CustomCommandDrawer';
import { IconPlus } from '@tabler/icons-react';
import type { WidgetConfig } from '../../types/telemetry';

export const DashboardView: React.FC = () => {
  const { widgets, maxWidgets, addWidget, updateWidget, removeWidget } = useWidgets();
  const { availableCommands } = useVehicle();
  const { liveValues, historyBuffers } = useBLE();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);

  const handleOpenAdd = (slotIdx: number) => {
    setEditingWidget(null);
    setSelectedSlotIndex(slotIdx);
    setModalOpen(true);
  };

  const handleOpenEdit = (widget: WidgetConfig) => {
    setEditingWidget(widget);
    setSelectedSlotIndex(widget.slotIndex);
    setModalOpen(true);
  };

  const handleSaveWidget = async (config: Omit<WidgetConfig, 'id'>) => {
    if (editingWidget) {
      await updateWidget(editingWidget.id, config);
    } else {
      await addWidget(config);
    }
  };

  // Build 5 slots array (filled or empty)
  const slots: (WidgetConfig | null)[] = [];
  for (let i = 0; i < maxWidgets; i++) {
    const existing = widgets.find((w) => w.slotIndex === i) || widgets[i] || null;
    slots.push(existing);
  }

  return (
    <div className="dashboard-container">
      {/* 5-Slot Responsive Widget Grid */}
      <div className="widget-grid" role="region" aria-label="Telemetry Widgets Grid">
        {slots.map((widget, slotIdx) => {
          if (widget) {
            const command =
              availableCommands.find((c) => c.id === widget.signalSourceId) ||
              availableCommands.find((c) => c.id.endsWith(widget.signalSourceId.replace(/^[^_]+_/, ''))) ||
              availableCommands.find((c) => c.modePid === widget.signalSourceId) ||
              (slotIdx === 0 ? availableCommands.find((c) => c.modePid === '010C' || c.commandName.includes('RPM')) : undefined) ||
              (slotIdx === 1 ? availableCommands.find((c) => c.modePid === '010D' || c.commandName.includes('Speed')) : undefined) ||
              (slotIdx === 2 ? availableCommands.find((c) => c.modePid === '0105' || c.commandName.includes('Coolant')) : undefined);
            const resolvedId = command?.id || widget.signalSourceId;
            const value = resolvedId ? liveValues[resolvedId] ?? liveValues[widget.signalSourceId] ?? null : null;
            const history = resolvedId ? historyBuffers[resolvedId] ?? historyBuffers[widget.signalSourceId] ?? [] : [];

            return (
              <div key={widget.id} className="widget-slot slot-filled">
                <WidgetCard
                  widget={widget}
                  command={command}
                  value={value}
                  history={history}
                  onEdit={() => handleOpenEdit(widget)}
                  onRemove={() => removeWidget(widget.id)}
                />
              </div>
            );
          }

          // Empty Slot: dashed border outline, centered "+ Add widget"
          return (
            <div key={`empty-${slotIdx}`} className="widget-slot slot-empty">
              <button
                type="button"
                className="add-widget-slot-btn"
                onClick={() => handleOpenAdd(slotIdx)}
                aria-label={`Add widget to slot ${slotIdx + 1}`}
              >
                <div className="add-widget-icon-pill">
                  <IconPlus size={20} stroke={2.5} />
                </div>
                <span className="add-widget-label">+ Add widget</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Custom Command Telemetry Section (Drawer) */}
      <div className="dashboard-drawer-section">
        <CustomCommandDrawer />
      </div>

      {/* Widget Config Modal */}
      <WidgetConfigModal
        isOpen={modalOpen}
        widget={editingWidget}
        slotIndex={selectedSlotIndex}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveWidget}
      />
    </div>
  );
};
