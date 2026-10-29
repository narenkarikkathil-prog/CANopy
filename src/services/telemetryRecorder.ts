import type { OBDCommand } from '../types/telemetry';

export interface TelemetrySample {
  timestamp: number;       // Epoch milliseconds
  isoTime: string;         // ISO 8601 string, e.g. "2026-10-27T16:45:01.120Z"
  elapsedSeconds: number;  // Seconds elapsed since recording start, e.g. 1.234
  cmdId: string;           // Command identifier
  commandName: string;     // Friendly name (e.g. "Engine RPM")
  modePid: string;         // Mode and PID (e.g. "010C")
  units: string;           // Measurement unit (e.g. "RPM", "km/h")
  value: number;           // Numeric sensor reading
  snapshot: Record<string, number>; // Latest known values of all active channels at this timestamp
}

/**
 * Formats a duration in seconds to mm:ss
 */
export function formatRecordingDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Escapes a string value for safe CSV formatting (RFC 4180).
 */
function escapeCSV(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a number to clean string (avoids IEEE 754 precision artifacts like 23.800000000000004).
 */
function formatNumericValue(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return '';
  if (Number.isInteger(val)) return val.toString();
  return parseFloat(val.toFixed(4)).toString();
}

/**
 * Generates an RFC 4180 compliant CSV string from an array of recorded telemetry samples.
 * Column structure:
 * - Column 1: Timestamp (ISO 8601 string)
 * - Column 2: Elapsed Time (s)
 * - Column 3: Timestamp (ms)
 * - Column 4: Triggered Signal
 * - Columns 5..N: One column per unique logged sensor channel with units
 */
export function generateTelemetryCSV(
  samples: TelemetrySample[],
  availableCommands: OBDCommand[]
): string {
  if (!samples || samples.length === 0) {
    return 'Timestamp (ISO),Elapsed Time (s),Timestamp (ms),Triggered Signal\n';
  }

  // 1. Identify all unique command IDs logged during the session
  const channelIds = Array.from(new Set(samples.map((s) => s.cmdId)));

  // Resolve command definitions for headers
  const channelHeaders = channelIds.map((id) => {
    const cmd = availableCommands.find((c) => c.id === id);
    const sample = samples.find((s) => s.cmdId === id);
    const name = cmd?.commandName || sample?.commandName || id;
    const pid = cmd?.modePid || sample?.modePid || '';
    const units = cmd?.units || sample?.units || '';
    
    let label = name;
    if (pid) label += ` (${pid})`;
    if (units) label += ` [${units}]`;
    return label;
  });

  // 2. Build CSV Header
  const headers = [
    'Timestamp (ISO)',
    'Elapsed Time (s)',
    'Timestamp (ms)',
    'Triggered Signal',
    ...channelHeaders,
  ];

  const rows: string[] = [];
  rows.push(headers.map(escapeCSV).join(','));

  // 3. Build CSV Rows for each timestamped sample
  for (const sample of samples) {
    const rowValues: string[] = [
      escapeCSV(sample.isoTime),
      formatNumericValue(sample.elapsedSeconds),
      sample.timestamp.toString(),
      escapeCSV(sample.commandName),
    ];

    // For each channel column, write its value from the sample's snapshot
    for (const chId of channelIds) {
      const channelVal = sample.snapshot ? sample.snapshot[chId] : undefined;
      rowValues.push(formatNumericValue(channelVal));
    }

    rows.push(rowValues.join(','));
  }

  return rows.join('\r\n') + '\r\n';
}

/**
 * Triggers a browser file download of the CSV content.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
