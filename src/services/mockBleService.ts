/**
 * mockBleService.ts
 * Dynamic ELM327 BLE Adapter Simulator.
 * Generates plausible live CAN responses dynamically for whatever OBDb signals
 * the active vehicle profile contains (Step 3). Zero hardcoded PID tables.
 */

import type { BLELogCallback } from './bleService';
import type { OBDCommand } from '../types/telemetry';
import type { AdapterCapabilities } from './adapterInit';

export class MockBLEService {
  private connected = false;
  private onLog: BLELogCallback | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private tickCount = 0;
  private getActiveCommandsCallback: (() => OBDCommand[]) | null = null;
  private capabilities: AdapterCapabilities = {
    identity: 'OBDLink MX+ v5.6.1 (Simulated)',
    deviceDescription: 'OBDLink MX+',
    isSTN: true,
    protocol: '6',
    supportsAT2: true,
    supportsCRA: true,
    supportsResponseCount: true,
    supportsL0: true,
    supportsS0: true,
    unsupportedCommands: new Set(),
    stageTimings: { sync: 15, reset: 25, config: 20, protocol: 30, capabilities: 25 },
    totalInitTimeMs: 115,
  };

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

  public getCapabilities(): AdapterCapabilities {
    return this.capabilities;
  }

  public getDeviceName(): string {
    return 'Simulated BLE Adapter';
  }

  public async connect(): Promise<void> {
    this.log('info', '[Simulator] Connecting to Simulated ELM327 v1.5 BLE Adapter...');
    await new Promise((r) => setTimeout(r, 200));
    this.connected = true;
    this.log('info', '[Simulator] Adapter connected. Executing init sequence...');
    await this.runInitSequence();
  }

  public async runInitSequence(): Promise<void> {
    const steps = [
      { cmd: '\\r', resp: '>' },
      { cmd: 'AT WS', resp: 'ELM327 v1.5' },
      { cmd: 'AT E0', resp: 'OK' },
      { cmd: 'AT L0', resp: 'OK' },
      { cmd: 'AT S0', resp: 'OK' },
      { cmd: 'AT H1', resp: 'OK' },
      { cmd: 'AT SP 6', resp: 'OK' },
      { cmd: 'ATI', resp: 'OBDLink MX+ v5.6.1' },
      { cmd: 'AT@1', resp: 'OBDLink MX+' },
      { cmd: 'STI', resp: 'STN2120 v5.6.1' },
      { cmd: 'AT AT2', resp: 'OK' },
    ];

    for (const step of steps) {
      this.log('tx', step.cmd);
      await new Promise((r) => setTimeout(r, 40));
      this.log('rx', step.resp);
    }

    this.log('info', '[Simulator] Fast initialization complete (ISO 15765-4 CAN 11/500, Headers ON, STN Mode)');
  }

  public async sendCommand(cmd: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Simulator is not connected');
    }

    this.tickCount++;
    const cleanCmd = cmd.trim().toUpperCase();
    await new Promise((r) => setTimeout(r, 25)); // Simulate realistic low-latency prompt response

    if (!cleanCmd || cleanCmd === '\\R' || cleanCmd === '\r') {
      return '>';
    }

    // 1. AT and ST command handler
    if (cleanCmd.startsWith('AT') || cleanCmd.startsWith('ST')) {
      if (cleanCmd === 'ATI' || cleanCmd === 'AT I') return 'OBDLink MX+ v5.6.1';
      if (cleanCmd === 'AT@1') return 'OBDLink MX+';
      if (cleanCmd === 'STI') return 'STN2120 v5.6.1';
      if (cleanCmd === 'AT WS') return 'ELM327 v1.5';
      if (cleanCmd === 'AT Z') return 'ELM327 v1.5';
      if (cleanCmd === 'AT RV') return '14.2V';
      if (cleanCmd === 'AT DPN') return '6';
      if (cleanCmd === 'AT DP') return 'ISO 15765-4 (CAN 11/500)';
      if (cleanCmd === 'AT AT2') return 'OK';
      if (
        cleanCmd.startsWith('AT SH') ||
        cleanCmd.startsWith('AT CRA') ||
        cleanCmd.startsWith('AT ST') ||
        cleanCmd.startsWith('AT SP') ||
        cleanCmd === 'AT E0' ||
        cleanCmd === 'AT L0' ||
        cleanCmd === 'AT S0' ||
        cleanCmd === 'AT H1'
      ) {
        return 'OK';
      }
      return 'OK';
    }

    if (cleanCmd === '0100' || cleanCmd.startsWith('0100')) {
      return '7E8 06 41 00 BE 3F B8 11';
    }

    // 2. Dynamic OBDb CAN response generator
    // Locate the command in active vehicle profile (strip trailing count digit like '1')
    const strippedCmd = cleanCmd.replace(/1$/, '');
    const activeCommands = this.getActiveCommandsCallback ? this.getActiveCommandsCallback() : [];
    const matchedCmd = activeCommands.find(
      (c) =>
        c.modePid === cleanCmd ||
        c.modePid === strippedCmd ||
        cleanCmd.endsWith(c.modePid) ||
        strippedCmd.endsWith(c.modePid)
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
    const cmdIdLower = (matchedCmd?.id || '').toLowerCase();
    const isElectricMotor = nameLower.includes('motor') || cmdIdLower.includes('motor');
    let simValue = 0;

    if (isElectricMotor && (nameLower.includes('rpm') || nameLower.includes('speed') || cmdIdLower.includes('rpm'))) {
      // Electric motor RPM: stationary at 0 RPM, tracking vehicle speed up to ~9500 RPM
      const speedFactor = Math.max(0, 0.45 + 0.45 * Math.sin(this.tickCount * 0.08));
      simValue = Math.round(speedFactor * 7800 + 150 * Math.sin(this.tickCount * 0.2));
    } else if (nameLower.includes('rpm') || pidLower === '010c') {
      // ICE Gas RPM: realistic idling + throttle oscillation between 850 and 3400 RPM
      simValue = 850 + 2500 * Math.sin(this.tickCount * 0.12) ** 2;
    } else if (nameLower.includes('speed') || pidLower === '010d' || cmdIdLower.includes('vss')) {
      // Speed: smooth driving cycle between 0 and 92 km/h
      simValue = Math.max(0, 48 + 42 * Math.sin(this.tickCount * 0.08));
    } else if (nameLower.includes('battery') && nameLower.includes('coolant')) {
      // EV battery liquid coolant: gentle thermal management 22°C - 27°C
      simValue = 24 + Math.sin(this.tickCount * 0.04) * 2.5;
    } else if (nameLower.includes('coolant') || pidLower === '0105') {
      // ICE Gas Coolant: warm operating temp around 89°C - 93°C
      simValue = 90 + Math.sin(this.tickCount * 0.04) * 2.5;
    } else if (nameLower.includes('soc') || nameLower.includes('state of charge') || cmdIdLower.includes('soc')) {
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
    } else if (nameLower.includes('accelerator') || nameLower.includes('pedal') || pidLower === '0111') {
      // Accelerator pedal / throttle position: 0% to 75%
      const pedal = Math.max(0, 25 + 35 * Math.sin(this.tickCount * 0.12));
      simValue = Math.round(pedal);
    } else if (nameLower.includes('brake') && (nameLower.includes('pressure') || cmdIdLower.includes('brk_fl_p'))) {
      // Brake hydraulic pressure: 0 to 120 kPa (peaks during braking)
      const brk = Math.max(0, 45 * Math.sin(this.tickCount * 0.08 + Math.PI));
      simValue = Math.round(brk);
    } else if (nameLower.includes('parking brake')) {
      // Parking brake: 0 (released) while vehicle is operating
      simValue = 0;
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
