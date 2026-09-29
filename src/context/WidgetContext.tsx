import React, { createContext, useContext, useEffect, useState } from 'react';
import type { WidgetConfig } from '../types/telemetry';
import { loadWidgets, saveWidgets } from '../services/storage';

const MAX_WIDGETS = 5;

const DEFAULT_INITIAL_WIDGETS: WidgetConfig[] = [
  {
    id: 'widget_rpm',
    slotIndex: 0,
    type: 'gauge',
    signalSourceId: 'std_rpm',
    scaleMin: 0,
    scaleMax: 8000,
    accentColor: 'neon-green',
  },
  {
    id: 'widget_speed',
    slotIndex: 1,
    type: 'lineGraph',
    signalSourceId: 'std_speed',
    scalingMode: 'auto',
    xAxisWindow: 30,
    yAxisMin: 0,
    yAxisMax: 140,
  },
  {
    id: 'widget_coolant',
    slotIndex: 2,
    type: 'numeric',
    signalSourceId: 'std_coolant',
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
        setWidgets(stored);
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
