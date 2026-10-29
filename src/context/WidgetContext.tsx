import React, { createContext, useContext, useEffect, useState } from 'react';
import type { WidgetConfig } from '../types/telemetry';
import { loadWidgets, saveWidgets } from '../services/storage';

const MAX_WIDGETS = 5;

export const DEFAULT_INITIAL_WIDGETS: WidgetConfig[] = [
  {
    id: 'widget_soc',
    slotIndex: 0,
    type: 'gauge',
    signalSourceId: 'MACHE_HVBAT_SOC',
    scaleMin: 0,
    scaleMax: 100,
    accentColor: 'neon-green',
  },
  {
    id: 'widget_speed',
    slotIndex: 1,
    type: 'lineGraph',
    signalSourceId: 'MACHE_VSS_HD',
    scalingMode: 'auto',
    xAxisWindow: 30,
    yAxisMin: 0,
    yAxisMax: 140,
    accentColor: 'cyan',
  },
  {
    id: 'widget_voltage',
    slotIndex: 2,
    type: 'numeric',
    signalSourceId: 'MACHE_HVBAT_V',
    accentColor: 'amber',
  },
];

interface WidgetContextType {
  widgets: WidgetConfig[];
  maxWidgets: number;
  addWidget: (config: Omit<WidgetConfig, 'id'>) => Promise<void>;
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => Promise<void>;
  removeWidget: (id: string) => Promise<void>;
  reorderSlots: (reordered: WidgetConfig[]) => Promise<void>;
}

const WidgetContext = createContext<WidgetContextType | null>(null);

export const WidgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function init() {
      const stored = await loadWidgets();
      if (stored && stored.length > 0) {
        // Automatically migrate legacy gas widgets (std_rpm, std_coolant) to authentic EV metrics
        const hasLegacyGasSignals = stored.some(
          (w) =>
            w.signalSourceId === 'std_rpm' ||
            w.signalSourceId === 'std_coolant' ||
            w.id === 'widget_rpm' ||
            w.id === 'widget_coolant'
        );
        if (hasLegacyGasSignals) {
          const migrated = stored.map((w) => {
            if (w.signalSourceId === 'std_rpm' || w.id === 'widget_rpm') {
              return {
                ...w,
                id: 'widget_soc',
                signalSourceId: 'MACHE_HVBAT_SOC',
                scaleMin: 0,
                scaleMax: 100,
                accentColor: w.accentColor || 'neon-green',
              };
            }
            if (w.signalSourceId === 'std_coolant' || w.id === 'widget_coolant') {
              return {
                ...w,
                id: 'widget_voltage',
                signalSourceId: 'MACHE_HVBAT_V',
                accentColor: w.accentColor || 'amber',
              };
            }
            if (w.signalSourceId === 'std_speed') {
              return {
                ...w,
                signalSourceId: 'MACHE_VSS_HD',
              };
            }
            return w;
          });
          setWidgets(migrated);
          await saveWidgets(migrated);
        } else {
          setWidgets(stored);
        }
      } else {
        setWidgets(DEFAULT_INITIAL_WIDGETS);
        await saveWidgets(DEFAULT_INITIAL_WIDGETS);
      }
      setLoaded(true);
    }
    init();
  }, []);

  const addWidget = async (config: Omit<WidgetConfig, 'id'>) => {
    if (widgets.length >= MAX_WIDGETS) {
      throw new Error(`Maximum of ${MAX_WIDGETS} widgets allowed`);
    }

    const id = `widget_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newWidget: WidgetConfig = {
      ...config,
      id,
    };

    const nextWidgets = [...widgets, newWidget];
    setWidgets(nextWidgets);
    await saveWidgets(nextWidgets);
  };

  const updateWidget = async (id: string, updates: Partial<WidgetConfig>) => {
    const nextWidgets = widgets.map((w) => (w.id === id ? { ...w, ...updates } : w));
    setWidgets(nextWidgets);
    await saveWidgets(nextWidgets);
  };

  const removeWidget = async (id: string) => {
    const remaining = widgets.filter((w) => w.id !== id);
    // Re-index slots
    const reindexed = remaining.map((w, idx) => ({ ...w, slotIndex: idx }));
    setWidgets(reindexed);
    await saveWidgets(reindexed);
  };

  const reorderSlots = async (reordered: WidgetConfig[]) => {
    const indexed = reordered.map((w, idx) => ({ ...w, slotIndex: idx }));
    setWidgets(indexed);
    await saveWidgets(indexed);
  };

  return (
    <WidgetContext.Provider
      value={{
        widgets,
        maxWidgets: MAX_WIDGETS,
        addWidget,
        updateWidget,
        removeWidget,
        reorderSlots,
      }}
    >
      {loaded ? children : null}
    </WidgetContext.Provider>
  );
};

export function useWidgets(): WidgetContextType {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error('useWidgets must be used within a WidgetProvider');
  }
  return context;
}
