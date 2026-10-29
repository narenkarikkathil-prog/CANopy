import type { WidgetConfig, OBDCommand } from '../types/telemetry';

/**
 * Robustly resolves a WidgetConfig to an available OBDCommand.
 * Handles:
 * 1. Exact match by command.id === widget.signalSourceId
 * 2. Case-insensitive suffix match (e.g. 'std_rpm' or 'rpm' -> '..._RPM')
 * 3. Match by modePid (e.g. '010C', '224801')
 * 4. Semantic aliases (rpm -> 010C, speed/vss -> 010D, coolant/ect -> 0105, battery/vbat -> 0142)
 * 5. Slot-based fallback (slot 0 -> RPM, slot 1 -> Speed, slot 2 -> Coolant)
 */
export function findCommandForWidget(
  widget: WidgetConfig | undefined | null,
  availableCommands: OBDCommand[],
  slotIdx?: number
): OBDCommand | undefined {
  if (!widget) return undefined;
  if (!availableCommands || availableCommands.length === 0) return undefined;

  const rawSignalId = widget.signalSourceId ? widget.signalSourceId.trim() : '';

  // 1. Direct ID match
  if (rawSignalId) {
    const direct = availableCommands.find((c) => c.id === rawSignalId);
    if (direct) return direct;
  }

  const rawSig = rawSignalId.replace(/^[^_]+_/, '').toLowerCase();

  // 2. Case-insensitive suffix match or exact raw ID
  if (rawSig) {
    const suffixMatch = availableCommands.find(
      (c) =>
        c.id.toLowerCase().endsWith('_' + rawSig) ||
        c.id.toLowerCase() === rawSig ||
        c.id.toLowerCase().endsWith(rawSig)
    );
    if (suffixMatch) return suffixMatch;
  }

  const isEv =
    availableCommands.some(
      (c) =>
        c.id.includes('MACHE') ||
        c.id.includes('HVBAT') ||
        c.commandName.toLowerCase().includes('motor') ||
        c.commandName.toLowerCase().includes('battery')
    ) && !availableCommands.some((c) => c.modePid === '010C');

  // 3. Match by modePid
  if (rawSignalId) {
    const pidMatch = availableCommands.find(
      (c) => c.modePid.toUpperCase() === rawSignalId.toUpperCase()
    );
    if (pidMatch) return pidMatch;
  }

  // 4. Semantic / synonym aliases
  if (rawSig.includes('soc') || rawSig.includes('state of charge') || (isEv && rawSig === 'rpm')) {
    const socMatch = availableCommands.find(
      (c) =>
        c.id.includes('HVBAT_SOC') ||
        c.commandName.toLowerCase().includes('charge') ||
        c.commandName.toLowerCase().includes('soc')
    );
    if (socMatch) return socMatch;
  }

  if (rawSig.includes('rpm') || rawSig.includes('motor')) {
    const rpmMatch = availableCommands.find(
      (c) =>
        (!isEv && c.modePid === '010C') ||
        c.commandName.toLowerCase().includes('motor speed') ||
        c.commandName.toLowerCase().includes('motor rpm') ||
        c.commandName.toLowerCase().includes('rpm') ||
        c.id.toLowerCase().includes('motor_rpm')
    );
    if (rpmMatch) return rpmMatch;
  }

  if (rawSig.includes('speed') || rawSig.includes('vss')) {
    const speedMatch = availableCommands.find(
      (c) =>
        c.modePid === '010D' ||
        c.id.includes('VSS') ||
        c.commandName.toLowerCase().includes('speed') ||
        c.id.toLowerCase().includes('vss')
    );
    if (speedMatch) return speedMatch;
  }

  if (rawSig.includes('coolant') || rawSig.includes('ect') || rawSig.includes('temp')) {
    const coolantMatch = availableCommands.find(
      (c) =>
        (!isEv && c.modePid === '0105') ||
        c.id.includes('COOLANT') ||
        c.commandName.toLowerCase().includes('coolant') ||
        c.commandName.toLowerCase().includes('temperature') ||
        c.id.toLowerCase().includes('temp') ||
        c.id.toLowerCase().includes('ect')
    );
    if (coolantMatch) return coolantMatch;
  }

  if (rawSig.includes('volt') || rawSig.includes('bat')) {
    const voltMatch = availableCommands.find(
      (c) =>
        c.id.includes('HVBAT_V') ||
        c.modePid === '0142' ||
        c.commandName.toLowerCase().includes('voltage') ||
        c.commandName.toLowerCase().includes('volt') ||
        c.id.toLowerCase().includes('bat')
    );
    if (voltMatch) return voltMatch;
  }

  if (rawSig.includes('throttle') || rawSig.includes('pedal') || rawSig.includes('accel')) {
    const pedalMatch = availableCommands.find(
      (c) =>
        c.id.includes('ACC_POS') ||
        c.id.includes('ACCEL') ||
        c.commandName.toLowerCase().includes('accelerator') ||
        c.commandName.toLowerCase().includes('pedal') ||
        (!isEv && (c.modePid === '0111' || c.commandName.toLowerCase().includes('throttle')))
    );
    if (pedalMatch) return pedalMatch;
  }

  if (rawSig.includes('brake') || rawSig.includes('brk')) {
    const brakeMatch = availableCommands.find(
      (c) =>
        c.id.includes('BRK') ||
        c.commandName.toLowerCase().includes('brake') ||
        c.id.includes('PARKING_BRAKE')
    );
    if (brakeMatch) return brakeMatch;
  }

  // 5. Slot index fallback (EV-aware vs ICE-aware)
  const idx = slotIdx !== undefined ? slotIdx : widget.slotIndex;
  if (idx === 0) {
    if (isEv) {
      const evSlot0 = availableCommands.find(
        (c) =>
          c.id.includes('HVBAT_SOC') ||
          c.commandName.toLowerCase().includes('state of charge') ||
          c.commandName.toLowerCase().includes('charge') ||
          c.id.includes('MOTOR_RPM')
      );
      if (evSlot0) return evSlot0;
    } else {
      const slot0 = availableCommands.find(
        (c) => c.modePid === '010C' || c.commandName.toLowerCase().includes('rpm')
      );
      if (slot0) return slot0;
    }
  } else if (idx === 1) {
    const slot1 = availableCommands.find(
      (c) =>
        c.id.includes('VSS') ||
        c.modePid === '010D' ||
        c.commandName.toLowerCase().includes('speed')
    );
    if (slot1) return slot1;
  } else if (idx === 2) {
    if (isEv) {
      const evSlot2 = availableCommands.find(
        (c) =>
          c.id.includes('HVBAT_V') ||
          c.commandName.toLowerCase().includes('battery voltage') ||
          c.id.includes('HVBAT_T')
      );
      if (evSlot2) return evSlot2;
    } else {
      const slot2 = availableCommands.find(
        (c) => c.modePid === '0105' || c.commandName.toLowerCase().includes('coolant')
      );
      if (slot2) return slot2;
    }
  }

  return undefined;
}

/**
 * Formats a number with a specific number of significant figures,
 * avoiding awkward scientific notation (e.g. 1200 instead of 1.2e+3).
 */
export function formatWithSigFigs(num: number, sigFigs: number): string {
  if (num === 0) return '0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const d = Math.floor(Math.log10(abs)) + 1;
  const power = sigFigs - d;
  const magnitude = 10 ** power;
  const rounded = Math.round(abs * magnitude) / magnitude;

  if (rounded >= 1000 && Number.isInteger(rounded)) {
    return sign + rounded.toLocaleString();
  }
  const decimals = Math.max(0, power);
  return sign + rounded.toFixed(decimals);
}

/**
 * Formats a number with fixed decimal places.
 */
export function formatWithDecimals(num: number, decimals: number): string {
  if (Math.abs(num) >= 1000 && decimals === 0) {
    return Math.round(num).toLocaleString();
  }
  return num.toFixed(decimals);
}

/**
 * Formats a telemetry numerical value based on widget config preferences.
 */
export function formatTelemetryValue(
  value: number | null | undefined,
  config?: Partial<WidgetConfig>
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }

  // 1. Explicit sigFigs
  if (config?.sigFigs && config.sigFigs !== 'auto') {
    return formatWithSigFigs(value, config.sigFigs);
  }

  // 2. Explicit decimalPlaces
  if (config?.decimalPlaces !== undefined && config.decimalPlaces !== 'auto') {
    return formatWithDecimals(value, config.decimalPlaces);
  }

  // 3. Combined precision option
  if (config?.precision && config.precision !== 'auto') {
    switch (config.precision) {
      case 'sig2':
        return formatWithSigFigs(value, 2);
      case 'sig3':
        return formatWithSigFigs(value, 3);
      case 'sig4':
        return formatWithSigFigs(value, 4);
      case 'dec0':
        return formatWithDecimals(value, 0);
      case 'dec1':
        return formatWithDecimals(value, 1);
      case 'dec2':
        return formatWithDecimals(value, 2);
      case 'dec3':
        return formatWithDecimals(value, 3);
    }
  }

  // 4. Default / auto formatting
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString();
  }
  if (Math.abs(value) < 10 && value % 1 !== 0) {
    return value.toFixed(1);
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

/**
 * Detects if a unit is convertible and returns the available toggle choices.
 * E.g. "km/h" -> ["km/h", "mph"]
 *      "°C"   -> ["°C", "°F"]
 *      "kPa"  -> ["kPa", "psi", "bar"]
 */
export function getConvertibleUnitOptions(sourceUnit?: string): string[] | null {
  if (!sourceUnit) return null;
  const clean = sourceUnit.trim().toLowerCase();
  if (clean === 'km/h' || clean === 'kph' || clean === 'kmh') return ['km/h', 'mph'];
  if (clean === 'mph') return ['mph', 'km/h'];
  if (clean === '°c' || clean === 'c' || clean === 'deg c' || clean === 'celsius') return ['°C', '°F'];
  if (clean === '°f' || clean === 'f' || clean === 'deg f' || clean === 'fahrenheit') return ['°F', '°C'];
  if (clean === 'kpa') return ['kPa', 'psi', 'bar'];
  if (clean === 'psi') return ['psi', 'bar', 'kPa'];
  if (clean === 'bar') return ['bar', 'psi', 'kPa'];
  if (clean === 'kw') return ['kW', 'hp'];
  if (clean === 'hp') return ['hp', 'kW'];
  if (clean === 'nm') return ['Nm', 'lb-ft'];
  if (clean === 'lb-ft' || clean === 'lbft' || clean === 'ft-lb') return ['lb-ft', 'Nm'];
  return null;
}

/**
 * Converts a numerical telemetry value from sourceUnit to targetUnit.
 */
export function convertTelemetryValue(
  value: number | null | undefined,
  sourceUnit?: string,
  targetUnit?: string
): { value: number | null; unit: string } {
  const origUnit = sourceUnit || '';
  if (value === null || value === undefined || isNaN(value)) {
    return { value: null, unit: targetUnit || origUnit };
  }
  if (!targetUnit || targetUnit === origUnit) {
    return { value, unit: origUnit };
  }

  const s = origUnit.trim().toLowerCase();
  const t = targetUnit.trim().toLowerCase();

  // Speed
  if ((s === 'km/h' || s === 'kph' || s === 'kmh') && t === 'mph') {
    return { value: value * 0.621371, unit: targetUnit };
  }
  if (s === 'mph' && (t === 'km/h' || t === 'kph')) {
    return { value: value * 1.60934, unit: targetUnit };
  }

  // Temperature
  if ((s === '°c' || s === 'c') && (t === '°f' || t === 'f')) {
    return { value: (value * 9) / 5 + 32, unit: targetUnit };
  }
  if ((s === '°f' || s === 'f') && (t === '°c' || t === 'c')) {
    return { value: ((value - 32) * 5) / 9, unit: targetUnit };
  }

  // Pressure
  if (s === 'kpa' && t === 'psi') return { value: value * 0.145038, unit: targetUnit };
  if (s === 'kpa' && t === 'bar') return { value: value / 100, unit: targetUnit };
  if (s === 'bar' && t === 'psi') return { value: value * 14.5038, unit: targetUnit };
  if (s === 'bar' && t === 'kpa') return { value: value * 100, unit: targetUnit };
  if (s === 'psi' && t === 'bar') return { value: value / 14.5038, unit: targetUnit };
  if (s === 'psi' && t === 'kpa') return { value: value / 0.145038, unit: targetUnit };

  // Power
  if (s === 'kw' && t === 'hp') return { value: value * 1.34102, unit: targetUnit };
  if (s === 'hp' && t === 'kw') return { value: value / 1.34102, unit: targetUnit };

  // Torque
  if (s === 'nm' && (t === 'lb-ft' || t === 'lbft')) return { value: value * 0.737562, unit: targetUnit };
  if ((s === 'lb-ft' || s === 'lbft') && t === 'nm') return { value: value / 0.737562, unit: targetUnit };

  return { value, unit: targetUnit };
}

/**
 * Resolves both unit conversion and formatted text for display in widgets.
 */
export function resolveDisplayValueAndUnit(
  rawVal: number | null | undefined,
  config?: Partial<WidgetConfig>,
  sourceUnit?: string
): { displayVal: number | null; formatted: string; unit: string } {
  const converted = convertTelemetryValue(rawVal, sourceUnit, config?.unitOverride);
  const formatted = formatTelemetryValue(converted.value, config);
  return {
    displayVal: converted.value,
    formatted,
    unit: converted.unit,
  };
}
