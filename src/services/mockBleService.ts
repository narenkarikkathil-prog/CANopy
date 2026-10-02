/**
 * mockBleService.ts
 * Dynamic ELM327 BLE Adapter Simulator.
 * Generates plausible live CAN responses dynamically for whatever OBDb signals
 * the active vehicle profile contains (Step 3). Zero hardcoded PID tables.
 */

import type { BLELogCallback } from './bleService';
import type { OBDCommand } from '../types/telemetry';

export class MockBLEService {
  private connected = false;
  private onLog: BLELogCallback | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private tickCount = 0;
  private getActiveCommandsCallback: (() => OBDCommand[]) | null = null;

  constructor(
    onLog?: BLELogCallback,
    onDisconnect?: () => void,
    getActiveCommands?: () => OBDCommand[]
  ) {
    if (onLog) this.onLog = onLog;
    if (onDisconnect) this.onDisconnectCallback = onDisconnect;
    if (getActiveCommands) this.getActiveCommandsCallback = getActiveCommands;
  }

  public setCommandProvider(provider: () => OBDCommand[]): void {
    this.getActiveCommandsCallback = provider;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getDeviceName(): string {
    return 'Simulated BLE Adapter';
  }

  public async connect(): Promise<void> {
    this.log('info', '[Simulator] Connecting to Simulated ELM327 v1.5 BLE Adapter...');
    await new Promise((r) => setTimeout(r, 350));
    this.connected = true;
    this.log('info', '[Simulator] Adapter connected. Executing init sequence...');
    await this.runInitSequence();
  }

  public async runInitSequence(): Promise<void> {
    const steps = [
      { cmd: 'AT Z', resp: 'ELM327 v1.5' },
      { cmd: 'AT SP 6', resp: 'OK' },
      { cmd: 'AT H1', resp: 'OK' },
    ];

    for (const step of steps) {
      this.log('tx', step.cmd);
      await new Promise((r) => setTimeout(r, 120));
      this.log('rx', step.resp);
    }

    this.log('info', '[Simulator] Initialization complete (CAN 11-bit 500kbps, Headers ON)');
  }

  public async sendCommand(cmd: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Simulator is not connected');
    }

    this.tickCount++;
    const cleanCmd = cmd.trim().toUpperCase();
    await new Promise((r) => setTimeout(r, 45)); // Simulate realistic UART transmission latency

    // 1. AT command handler
    if (cleanCmd.startsWith('AT')) {
      if (cleanCmd === 'AT Z') return 'ELM327 v1.5';
      if (cleanCmd === 'AT RV') return '14.2V'; // 12V system voltage (passes battery guard)
      if (cleanCmd === 'AT DP') return 'ISO 15765-4 (CAN 11/500)';
      if (cleanCmd.startsWith('AT SH') || cleanCmd.startsWith('AT CRA') || cleanCmd.startsWith('AT ST')) {
        return 'OK';
      }
      return 'OK';
    }

    // 2. Dynamic OBDb CAN response generator
    // Locate the command in active vehicle profile
    const activeCommands = this.getActiveCommandsCallback ? this.getActiveCommandsCallback() : [];
    const matchedCmd = activeCommands.find(
      (c) => c.modePid === cleanCmd || cleanCmd.endsWith(c.modePid)
    );

    const service = cleanCmd.slice(0, 2);
    const pid = cleanCmd.slice(2);
    const serviceNum = parseInt(service, 16);
    const echoService = ((serviceNum + 0x40) & 0xff).toString(16).toUpperCase().padStart(2, '0');

    // Generate plausible telemetry value
    let min = matchedCmd?.minVal ?? 0;
    let max = matchedCmd?.maxVal ?? 100;
    if (max <= min) max = min + 100;

    // Metric-specific realistic behavior
    const nameLower = (matchedCmd?.commandName || '').toLowerCase();
    const pidLower = cleanCmd.toLowerCase();
    let simValue = 0;

    if (nameLower.includes('rpm') || pidLower === '010c') {
      // RPM: realistic idling + throttle oscillation between 850 and 3400 RPM
      simValue = 850 + 2500 * Math.sin(this.tickCount * 0.12) ** 2;
    } else if (nameLower.includes('speed') || pidLower === '010d') {
      // Speed: smooth driving cycle between 0 and 92 km/h
      simValue = Math.max(0, 48 + 42 * Math.sin(this.tickCount * 0.08));
    } else if (nameLower.includes('coolant') || pidLower === '0105') {
      // Coolant: warm operating temp around 89°C - 93°C
      simValue = 90 + Math.sin(this.tickCount * 0.04) * 2.5;
    } else if (nameLower.includes('soc') || nameLower.includes('state of charge')) {
      // HV battery state of charge: 74% - 78%
      simValue = 76.5 + Math.sin(this.tickCount * 0.03) * 1.5;
    } else if (nameLower.includes('voltage') || nameLower.includes('volt')) {
      // Battery voltage
      if (max > 100) {
        // High voltage traction battery (360V - 395V)
        simValue = 378 + Math.sin(this.tickCount * 0.05) * 12;
      } else {
        // 12V auxiliary battery
        simValue = 14.1 + Math.sin(this.tickCount * 0.06) * 0.2;
      }
    } else if (nameLower.includes('current') || nameLower.includes('amp')) {
      // High voltage battery current: -20A regen to +60A discharge
      simValue = -10 + 45 * Math.sin(this.tickCount * 0.1);
    } else {
      // General plausible oscillation between min and max
      const span = max - min;
      simValue = min + span * (0.35 + 0.3 * Math.sin(this.tickCount * 0.1 + (min % 5)) ** 2);
    }

    // Convert simulated value into raw byte payload using OBDb format if available
    const fmt = matchedCmd?.obdbFmt;
    const mul = fmt?.mul ?? 1;
    const div = fmt?.div ?? 1;
    const add = fmt?.add ?? 0;
    const bitLen = fmt?.len ?? 16;
    const byteLen = Math.max(1, Math.ceil(bitLen / 8));

    // Invert scaling: raw = (val - add) * div / mul
    let raw = Math.round(((simValue - add) * div) / mul);
    if (fmt?.sign && raw < 0) {
      raw = (1 << bitLen) + raw;
    }

    // Format bytes
    const dataBytes: string[] = [];
    for (let b = byteLen - 1; b >= 0; b--) {
      const byteVal = (raw >> (b * 8)) & 0xff;
      dataBytes.push(byteVal.toString(16).toUpperCase().padStart(2, '0'));
    }

    // Format CAN response frame with 11-bit header (7E8)
    const header = matchedCmd?.rax || '7E8';

    if (service === '22') {
      // Mode 22: 2-byte PID (4 hex chars: e.g. 48 99)
      const pidB1 = pid.slice(0, 2);
      const pidB2 = pid.slice(2, 4);
      const lenHex = (1 + 2 + dataBytes.length).toString(16).padStart(2, '0').toUpperCase();
      return `${header} ${lenHex} ${echoService} ${pidB1} ${pidB2} ${dataBytes.join(' ')}`;
    } else {
      // Mode 01 or 21: 1-byte PID (2 hex chars)
      const lenHex = (1 + 1 + dataBytes.length).toString(16).padStart(2, '0').toUpperCase();
      return `${header} ${lenHex} ${echoService} ${pid.slice(0, 2)} ${dataBytes.join(' ')}`;
    }
  }

  public disconnect(): void {
    this.connected = false;
    this.log('info', '[Simulator] Adapter disconnected');
    if (this.onDisconnectCallback) this.onDisconnectCallback();
  }

  private log(direction: any, text: string): void {
    if (this.onLog) {
      this.onLog({ direction, text });
    }
  }
}
