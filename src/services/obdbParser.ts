/**
 * obdbParser.ts
 * Parser and decoder for OBDb v3 schema signals and diagnostic commands.
 * Implements bit-level extraction, signed two's complement, scaling, offset,
 * unit mapping, and service ID safety allowlist.
 */

import type { OBDCommand } from '../types/telemetry';

export interface OBDbFilter {
  from?: number;
  to?: number;
  years?: number[];
}

export interface OBDbSignalFmt {
  bix?: number; // Bit index in payload, default 0
  len: number; // Length in bits
  blsb?: boolean; // Byte LSB first, default false
  sign?: boolean; // Signed two's complement, default false
  min?: number;
  max?: number;
  add?: number; // Offset to add, default 0
  mul?: number; // Multiplier, default 1
  div?: number; // Divisor, default 1
  unit?: string; // Unit string (e.g. celsius, kilometersPerHour)
  nullmin?: number;
  nullmax?: number;
  omin?: number;
  omax?: number;
  oval?: number;
  map?: Record<string, { value: string; description?: string } | string>;
}

export interface OBDbSignal {
  id: string;
  name: string;
  description?: string;
  hidden?: boolean;
  path?: string;
  suggestedMetric?: string;
  fmt: OBDbSignalFmt;
}

export interface OBDbCommand {
  hdr?: string;
  rax?: string;
  eax?: string;
  pri?: string;
  tst?: string;
  tmo?: string;
  fcm1?: boolean;
  dbg?: boolean;
  din?: string;
  dout?: string;
  cmd: {
    '01'?: string;
    '21'?: string;
    '22'?: string;
    [key: string]: string | undefined;
  };
  freq?: number;
  proto?: string;
  filter?: OBDbFilter;
  dbgfilter?: OBDbFilter;
  signals: OBDbSignal[];
}

export interface OBDbDataset {
  ecu?: Array<{ hdr: string; type: string; eax?: string; rax?: string }>;
  commands: OBDbCommand[];
}

// ==========================================
// SAFETY ALLOWLIST (STEP 4)
// Only read-only services allowed: 01, 02, 09, 19, 21, 22
// Hard-blocks any write, clear, reset, or actuator routines (10, 11, 14, 27, 2E, 2F, 31, etc.)
// ==========================================
export const ALLOWED_READONLY_SERVICES = new Set<string>([
  '01', // J1979 Show Current Data
  '02', // J1979 Show Freeze Frame Data
  '09', // J1979 Request Vehicle Information
  '19', // UDS ReadDTCInformation
  '21', // UDS ReadDataByLocalIdentifier
  '22', // UDS ReadDataByIdentifier
]);

export const DANGEROUS_BLOCKED_SERVICES: Record<string, string> = {
  '10': 'DiagnosticSessionControl (Non-default session switch)',
  '11': 'ECUReset (Hard / Soft reset)',
  '14': 'ClearDiagnosticInformation (Clears DTCs)',
  '27': 'SecurityAccess (Seed & Key unlock)',
  '2E': 'WriteDataByIdentifier (ECU Flash / Config write)',
  '2F': 'InputOutputControlByIdentifier (Actuator control / override)',
  '31': 'RoutineControl (Executes self-tests / actuator routines)',
};

/**
 * Checks if a service ID is permitted by the safety allowlist.
 */
export function isServiceAllowed(serviceId: string): { allowed: boolean; reason?: string } {
  const clean = serviceId.trim().toUpperCase().padStart(2, '0');
  if (DANGEROUS_BLOCKED_SERVICES[clean]) {
    return {
      allowed: false,
      reason: `Blocked dangerous service 0x${clean}: ${DANGEROUS_BLOCKED_SERVICES[clean]}`,
    };
  }
  if (!ALLOWED_READONLY_SERVICES.has(clean)) {
    return {
      allowed: false,
      reason: `Service 0x${clean} is not in read-only allowlist (Allowed: 01, 02, 09, 19, 21, 22)`,
    };
  }
  return { allowed: true };
}

/**
 * Validates a mode/PID command string (e.g. "010C" or "224899") against the safety allowlist.
 */
export function validateCommandSafety(modePid: string): { allowed: boolean; reason?: string } {
  const clean = modePid.trim().replace(/^AT\s+/i, '').toUpperCase();
  // Allow AT read/config commands
  if (modePid.trim().toUpperCase().startsWith('AT')) {
    const at = modePid.trim().toUpperCase();
    if (
      at === 'AT Z' ||
      at === 'AT RV' ||
      at === 'AT DP' ||
      at === 'AT SP 6' ||
      at === 'AT H1' ||
      at.startsWith('AT SH') ||
      at.startsWith('AT CRA') ||
      at.startsWith('AT ST')
    ) {
      return { allowed: true };
    }
  }

  const service = clean.slice(0, 2);
  return isServiceAllowed(service);
}

// ==========================================
// BIT-LEVEL DECODING (OBDb v3 Reference)
// ==========================================

/**
 * Extracts bits from raw response data bytes.
 * Matches Python OBDb reference implementation:
 * - bitOffset (bix): start bit index (0-indexed)
 * - bitLength (len): number of bits to extract
 * - bytesLsb (blsb): byte LSB first if true
 */
export function extractBits(data: number[], bitOffset = 0, bitLength = 8, bytesLsb = false): number {
  if (data.length === 0 || bitLength <= 0) return 0;

  const totalBits = data.length * 8;
  const startBit = bitOffset;
  const endBit = startBit + bitLength;

  if (endBit > totalBits) {
    // If not enough data returned by ECU, use available bits or return 0
    return 0;
  }

  let dataArray = [...data];

  if (bytesLsb && bitLength > 8) {
    const startByte = Math.floor(startBit / 8);
    const byteCount = Math.floor((bitLength + 7) / 8);
    const endByte = Math.min(startByte + byteCount, dataArray.length);

    const reversed = dataArray.slice(startByte, endByte).reverse();
    for (let j = 0; j < reversed.length; j++) {
      dataArray[startByte + j] = reversed[j];
    }
  }

  // Extract bits into integer (supporting up to 32 bits safely in JS bitwise, BigInt for larger)
  if (bitLength > 32) {
    let bigResult = 0n;
    for (let i = startBit; i < endBit; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = 7 - (i % 8);
      if ((dataArray[byteIdx] & (1 << bitIdx)) !== 0) {
        bigResult |= 1n << BigInt(endBit - i - 1);
      }
    }
    return Number(bigResult);
  }

  let result = 0;
  for (let i = startBit; i < endBit; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = 7 - (i % 8);
    if ((dataArray[byteIdx] & (1 << bitIdx)) !== 0) {
      result |= 1 << (endBit - i - 1);
    }
  }

  return result >>> 0; // Return unsigned 32-bit integer
}

/**
 * Converts unsigned integer to signed two's complement.
 */
export function twosComplement(value: number, bits: number): number {
  if (bits <= 0) return value;
  const signBit = 1 << (bits - 1);
  if ((value & signBit) !== 0) {
    return value - (1 << bits);
  }
  return value;
}

/**
 * Decodes a raw byte payload for an OBDb signal using its format specification.
 */
export function decodeOBDbSignal(fmt: OBDbSignalFmt, data: number[]): { value: number; formattedText?: string } {
  const bix = fmt.bix || 0;
  const len = fmt.len;
  const blsb = Boolean(fmt.blsb);
  const sign = Boolean(fmt.sign);

  let raw = extractBits(data, bix, len, blsb);

  if (sign) {
    raw = twosComplement(raw, len);
  }

  const mul = fmt.mul ?? 1;
  const div = fmt.div ?? 1;
  const add = fmt.add ?? 0;

  let scaled = (raw * mul) / div + add;

  // Check min/max clamping if defined
  if (fmt.min !== undefined && fmt.max !== undefined && fmt.max > fmt.min) {
    scaled = Math.max(fmt.min, Math.min(scaled, fmt.max));
  }

  // Check enumeration mapping
  let formattedText: string | undefined;
  if (fmt.map) {
    const rawKey = raw.toString();
    const entry = fmt.map[rawKey];
    if (entry) {
      formattedText = typeof entry === 'string' ? entry : entry.value || entry.description;
    }
  }

  return { value: scaled, formattedText };
}

// ==========================================
// UNIT & CATEGORY MAPPING
// ==========================================

export function formatOBDbUnit(unit?: string): string {
  if (!unit) return '';
  switch (unit) {
    case 'celsius':
      return '°C';
    case 'fahrenheit':
      return '°F';
    case 'kilometersPerHour':
      return 'km/h';
    case 'milesPerHour':
      return 'mph';
    case 'revolutionsPerMinute':
    case 'rpm':
      return 'RPM';
    case 'volts':
      return 'V';
    case 'millivolts':
      return 'mV';
    case 'kilovolts':
      return 'kV';
    case 'amps':
      return 'A';
    case 'milliamps':
      return 'mA';
    case 'percent':
      return '%';
    case 'kilopascal':
      return 'kPa';
    case 'bars':
      return 'bar';
    case 'kilowattHours':
      return 'kWh';
    case 'kilowatts':
      return 'kW';
    case 'gramsPerSecond':
      return 'g/s';
    case 'liters':
      return 'L';
    case 'gallons':
      return 'gal';
    case 'kilometers':
      return 'km';
    case 'miles':
      return 'mi';
    case 'yesno':
    case 'noyes':
    case 'offon':
    case 'onoff':
    case 'boolean':
      return '';
    default:
      return unit;
  }
}

/**
 * Synthesizes a readable algebraic formula from OBDb format specs.
 */
export function generateFormulaString(fmt: OBDbSignalFmt): string {
  const bix = fmt.bix || 0;
  const len = fmt.len;
  const byteOffset = Math.floor(bix / 8);

  const mul = fmt.mul ?? 1;
  const div = fmt.div ?? 1;
  const add = fmt.add ?? 0;

  // Single-byte aligned
  if (len === 8 && bix % 8 === 0) {
    const varName = String.fromCharCode(65 + byteOffset);
    if (mul === 1 && div === 1) {
      if (add === 0) return varName;
      return add > 0 ? `${varName}+${add}` : `${varName}${add}`;
    }
    const scaled = div !== 1 ? `(${varName}*${mul})/${div}` : `(${varName}*${mul})`;
    return add === 0 ? scaled : add > 0 ? `${scaled}+${add}` : `${scaled}${add}`;
  }

  // 16-bit aligned
  if (len === 16 && bix % 8 === 0) {
    const var1 = String.fromCharCode(65 + byteOffset);
    const var2 = String.fromCharCode(65 + byteOffset + 1);
    const base = fmt.sign ? `signed(${var1}*256+${var2})` : `(${var1}*256+${var2})`;
    if (mul === 1 && div === 1) {
      if (add === 0) return base;
      return add > 0 ? `${base}+${add}` : `${base}${add}`;
    }
    const scaled = div !== 1 ? `(${base}*${mul})/${div}` : `(${base}*${mul})`;
    return add === 0 ? scaled : add > 0 ? `${scaled}+${add}` : `${scaled}${add}`;
  }

  // Sub-byte or bitfield formula description
  if (len === 1) {
    const varName = String.fromCharCode(65 + byteOffset);
    const bitInByte = 7 - (bix % 8);
    return `(${varName}>>${bitInByte})&1`;
  }

  // General fallback
  const startVar = String.fromCharCode(65 + byteOffset);
  return `decode(${startVar}, bix:${bix}, len:${len}, mul:${mul}, div:${div}, add:${add})`;
}

/**
 * Checks whether an OBDb command matches a specific model year.
 */
export function matchesYear(filter?: OBDbFilter, year?: number | 'all'): boolean {
  if (!filter || year === 'all' || !year) return true;

  if (filter.years && filter.years.length > 0) {
    return filter.years.includes(year);
  }

  if (filter.from !== undefined && year < filter.from) {
    return false;
  }

  if (filter.to !== undefined && year > filter.to) {
    return false;
  }

  return true;
}

/**
 * Transforms an OBDbCommand into flat OBDCommands compatible with the app.
 */
export function convertOBDbCommandToAppCommands(
  cmd: OBDbCommand,
  vehicleName: string,
  modelYear?: number | 'all'
): OBDCommand[] {
  // Check year filter
  if (!matchesYear(cmd.filter, modelYear) || !matchesYear(cmd.dbgfilter, modelYear)) {
    return [];
  }

  // Determine mode/PID
  let service = '01';
  let pid = '';

  if (cmd.cmd['22']) {
    service = '22';
    pid = cmd.cmd['22'];
  } else if (cmd.cmd['01']) {
    service = '01';
    pid = cmd.cmd['01'];
  } else if (cmd.cmd['21']) {
    service = '21';
    pid = cmd.cmd['21'];
  } else {
    // Other service ID
    const keys = Object.keys(cmd.cmd);
    if (keys.length > 0) {
      service = keys[0];
      pid = cmd.cmd[service] || '';
    }
  }

  const modePid = `${service}${pid.padStart(service === '22' ? 4 : 2, '0')}`.toUpperCase();

  // Safety check: skip any command not in read-only allowlist
  const safety = isServiceAllowed(service);
  if (!safety.allowed) {
    console.warn(`[OBDb Safety] Skipping unsafe command ${modePid}: ${safety.reason}`);
    return [];
  }

  const header = cmd.hdr || '7E0';

  return (cmd.signals || []).map((sig) => {
    const cleanUnit = formatOBDbUnit(sig.fmt.unit);
    const formulaStr = generateFormulaString(sig.fmt);
    const category = sig.path ? sig.path.split('.')[0] : 'General';

    return {
      id: `${vehicleName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${sig.id}`,
      vehicleName,
      commandName: sig.name || sig.id,
      header,
      modePid,
      formula: formulaStr,
      units: cleanUnit,
      minVal: sig.fmt.min ?? 0,
      maxVal: sig.fmt.max ?? 100,
      isCustom: false,
      category,
      description: sig.description,
      suggestedMetric: sig.suggestedMetric,
      obdbFmt: sig.fmt,
      serviceId: service,
      pid,
      eax: cmd.eax,
      rax: cmd.rax,
    };
  });
}
