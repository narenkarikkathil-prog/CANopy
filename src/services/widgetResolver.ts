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

  // 3. Match by modePid
  if (rawSignalId) {
    const pidMatch = availableCommands.find(
      (c) => c.modePid.toUpperCase() === rawSignalId.toUpperCase()
    );
    if (pidMatch) return pidMatch;
  }

  // 4. Semantic / synonym aliases
  if (rawSig.includes('rpm') || rawSig.includes('motor')) {
    const rpmMatch = availableCommands.find(
      (c) =>
        c.modePid === '010C' ||
        c.commandName.toLowerCase().includes('rpm') ||
        c.id.toLowerCase().includes('rpm')
    );
    if (rpmMatch) return rpmMatch;
  }

  if (rawSig.includes('speed') || rawSig.includes('vss')) {
    const speedMatch = availableCommands.find(
      (c) =>
        c.modePid === '010D' ||
        c.commandName.toLowerCase().includes('speed') ||
        c.id.toLowerCase().includes('vss')
    );
    if (speedMatch) return speedMatch;
  }

  if (rawSig.includes('coolant') || rawSig.includes('ect') || rawSig.includes('temp')) {
    const coolantMatch = availableCommands.find(
      (c) =>
        c.modePid === '0105' ||
        c.commandName.toLowerCase().includes('coolant') ||
        c.id.toLowerCase().includes('ect')
    );
    if (coolantMatch) return coolantMatch;
  }

  if (rawSig.includes('volt') || rawSig.includes('bat')) {
    const voltMatch = availableCommands.find(
      (c) =>
        c.modePid === '0142' ||
        c.commandName.toLowerCase().includes('volt') ||
        c.id.toLowerCase().includes('bat')
    );
    if (voltMatch) return voltMatch;
  }

  // 5. Slot index fallback
  const idx = slotIdx !== undefined ? slotIdx : widget.slotIndex;
  if (idx === 0) {
    const slot0 = availableCommands.find(
      (c) => c.modePid === '010C' || c.commandName.toLowerCase().includes('rpm')
    );
    if (slot0) return slot0;
  } else if (idx === 1) {
    const slot1 = availableCommands.find(
      (c) => c.modePid === '010D' || c.commandName.toLowerCase().includes('speed')
    );
    if (slot1) return slot1;
  } else if (idx === 2) {
    const slot2 = availableCommands.find(
      (c) => c.modePid === '0105' || c.commandName.toLowerCase().includes('coolant')
    );
    if (slot2) return slot2;
  }

  return undefined;
}
