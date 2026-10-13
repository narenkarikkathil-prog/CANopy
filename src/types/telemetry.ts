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
  sourceCsvId?: string; // Tracks which uploaded CSV file this command came from
  sourceCsvName?: string; // Original uploaded CSV filename
  category?: string;
  description?: string;
  suggestedMetric?: string;
  obdbFmt?: any;
  serviceId?: string;
  pid?: string;
  eax?: string;
  rax?: string;
}

export interface UploadedCsvFile {
  id: string;
  fileName: string;
  uploadedAt: number;
  rowCount: number;
  commandCount: number;
  vehicleNames: string[];
}

export interface VehicleProfile {
  name: string;
  commands: OBDCommand[];
  isDefault?: boolean;
  protocol?: string; // e.g. "6" for ISO 15765-4 CAN 11/500
}

export type PrecisionOption = 'auto' | 'sig2' | 'sig3' | 'sig4' | 'dec0' | 'dec1' | 'dec2' | 'dec3';

export interface WidgetConfig {
  id: string;
  slotIndex: number; // 0 to 4 (max 5 widgets)
  type: WidgetType;
  signalSourceId: string; // OBDCommand.id
  // Number precision & significant figures
  precision?: PrecisionOption;
  sigFigs?: number | 'auto';
  decimalPlaces?: number | 'auto';
  // Unit conversion (e.g. 'mph' instead of 'km/h', '°F' instead of '°C')
  unitOverride?: string;
  // Accent & visual styling
  accentColor?: GaugeAccent;
  // Gauge specific
  scaleMin?: number;
  scaleMax?: number;
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
