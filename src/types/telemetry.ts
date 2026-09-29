export type WidgetType = 'gauge' | 'lineGraph' | 'numeric';

export type GaugeAccent = 'neon-green' | 'amber' | 'red' | 'cyan' | 'blue';

export const GAUGE_ACCENT_COLORS: Record<GaugeAccent, { name: string; hex: string; varName: string }> = {
  'neon-green': { name: 'Neon Green', hex: '#39D98A', varName: 'var(--gauge-neon-green)' },
  'amber': { name: 'Amber', hex: '#D9A441', varName: 'var(--gauge-amber)' },
  'red': { name: 'Red', hex: '#C0433A', varName: 'var(--gauge-red)' },
  'cyan': { name: 'Cyan', hex: '#4E9B9B', varName: 'var(--gauge-cyan)' },
  'blue': { name: 'Blue', hex: '#4A6FA5', varName: 'var(--gauge-blue)' },
};

export interface OBDCommand {
  id: string;
  vehicleName: string;
  commandName: string;
  header: string;      // e.g. "7E0", "7E4"
  modePid: string;     // e.g. "010C", "224801"
  formula: string;     // e.g. "((A*256)+B)/4"
  units: string;       // e.g. "RPM", "%", "V", "°C"
  minVal: number;
  maxVal: number;
  isCustom?: boolean;
  category?: string;
  description?: string;
  suggestedMetric?: string;
  obdbFmt?: any;
  serviceId?: string;
  pid?: string;
  eax?: string;
  rax?: string;
}

export interface VehicleProfile {
  name: string;
  commands: OBDCommand[];
  isDefault?: boolean;
}

export interface WidgetConfig {
  id: string;
  slotIndex: number; // 0 to 4 (max 5 widgets)
  type: WidgetType;
  signalSourceId: string; // OBDCommand.id
  // Gauge specific
  scaleMin?: number;
  scaleMax?: number;
  accentColor?: GaugeAccent;
  // Line graph specific
  scalingMode?: 'auto' | 'manual';
  xAxisWindow?: number; // seconds (e.g. 30, 60)
  yAxisMin?: number;
  yAxisMax?: number;
}

export interface TelemetryPoint {
  timestamp: number;
  value: number;
}

export type LiveTelemetryMap = Record<string, number | null>;
export type HistoryBufferMap = Record<string, TelemetryPoint[]>;
