import type { ATLogEntry } from '../types/ble';
import { validateCommandSafety } from './obdbParser';

export const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NORDIC_UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
export const NORDIC_UART_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify

export type BLELogCallback = (entry: Omit<ATLogEntry, 'id' | 'timestamp'>) => void;

export class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private rxCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private receiveBuffer = '';
  private pendingResolver: ((response: string) => void) | null = null;
  private pendingRejecter: ((err: Error) => void) | null = null;
  private commandTimeoutTimer: any = null;

  private onLog: BLELogCallback | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  constructor(onLog?: BLELogCallback, onDisconnect?: () => void) {
    if (onLog) this.onLog = onLog;
    if (onDisconnect) this.onDisconnectCallback = onDisconnect;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public isConnected(): boolean {
    return !!(this.server && this.server.connected);
  }

  public getDeviceName(): string | undefined {
    return this.device?.name;
  }

  public async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Bluefy on iOS.');
    }

    this.log('info', 'Requesting Bluetooth device (Nordic UART)...');

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [NORDIC_UART_SERVICE] }],
        optionalServices: [NORDIC_UART_SERVICE],
      });
    } catch (err: any) {
      // User cancelled picker or device not found
      throw new Error(err.message || 'Bluetooth device selection cancelled');
    }

    if (!this.device) {
      throw new Error('No device selected');
    }

    this.device.addEventListener('gattserverdisconnected', () => {
      this.log('error', 'GATT Server disconnected');
      this.cleanup();
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    });

    this.log('info', `Connecting to GATT Server on ${this.device.name || 'OBD-II Adapter'}...`);
    this.server = await this.device.gatt!.connect();

    this.log('info', 'Discovering Nordic UART Service...');
    const service = await this.server.getPrimaryService(NORDIC_UART_SERVICE);

    this.log('info', 'Obtaining TX and RX characteristics...');
    this.txCharacteristic = await service.getCharacteristic(NORDIC_UART_TX);
    this.rxCharacteristic = await service.getCharacteristic(NORDIC_UART_RX);

    // Setup notifications on RX
    await this.rxCharacteristic.startNotifications();
    this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      this.handleRxData(event.target.value);
    });

    this.log('info', 'BLE connection established. Running OBD-II initialization sequence...');
    await this.runInitSequence();
  }

  /**
   * Module 3 Initialization Sequence:
   * 1. AT Z  (reset)
   * 2. AT SP 6 (ISO 15765-4, CAN 11-bit, 500 kbps)
   * 3. AT H1 (headers on)
   */
  public async runInitSequence(): Promise<void> {
    const initSteps = [
      { cmd: 'AT Z', label: 'Reset (AT Z)', timeoutMs: 4000 },
      { cmd: 'AT SP 6', label: 'Protocol Select (AT SP 6)', timeoutMs: 3000 },
      { cmd: 'AT H1', label: 'Headers On (AT H1)', timeoutMs: 3000 },
    ];

    for (const step of initSteps) {
      this.log('tx', step.cmd);
      let response = '';
      try {
        response = await this.sendCommand(step.cmd, step.timeoutMs);
        this.log('rx', response);
      } catch (err: any) {
        this.log('error', `${step.label} timed out or failed: ${err.message}`);
        this.disconnect();
        throw new Error(`Init command ${step.cmd} failed: ${err.message}`);
      }

      // Check for error responses
      const cleanResp = response.trim().toUpperCase();
      if (cleanResp.includes('?') || cleanResp.includes('ERROR') || cleanResp.includes('NO DATA')) {
        this.log('error', `${step.label} rejected by adapter: "${response}"`);
        this.disconnect();
        throw new Error(`Init command ${step.cmd} rejected: "${response}"`);
      }
    }

    this.log('info', 'OBD-II Adapter initialized successfully (CAN 11-bit 500kbps, Headers ON)');
  }

  /**
   * Sends raw AT or OBD command and awaits response ending with ELM prompt character '>'.
   */
  public async sendCommand(cmd: string, timeoutMs = 3000): Promise<string> {
    if (!this.txCharacteristic || !this.server?.connected) {
      throw new Error('Not connected to BLE adapter');
    }

    // Safety allowlist verification
    const safety = validateCommandSafety(cmd);
    if (!safety.allowed) {
      this.log('error', `[Safety Blocked] ${safety.reason}`);
      throw new Error(`[OBDb Safety Hard Block] ${safety.reason}`);
    }

    // Cancel any previous pending command
    if (this.pendingRejecter) {
      clearTimeout(this.commandTimeoutTimer);
      this.pendingRejecter(new Error('Cancelled by new command'));
      this.pendingResolver = null;
      this.pendingRejecter = null;
    }

    this.receiveBuffer = '';
    const formattedCmd = cmd.trim() + '\r';
    const encoder = new TextEncoder();
    const data = encoder.encode(formattedCmd);

    return new Promise<string>((resolve, reject) => {
      this.pendingResolver = resolve;
      this.pendingRejecter = reject;

      this.commandTimeoutTimer = setTimeout(() => {
        this.pendingResolver = null;
        this.pendingRejecter = null;
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for response to "${cmd}"`));
      }, timeoutMs);

      // Write value to TX characteristic
      if ('writeValueWithoutResponse' in this.txCharacteristic!) {
        this.txCharacteristic!.writeValueWithoutResponse(data).catch(reject);
      } else {
        this.txCharacteristic!.writeValue(data).catch(reject);
      }
    });
  }

  private handleRxData(dataView: DataView): void {
    const decoder = new TextDecoder();
    const chunk = decoder.decode(dataView);
    this.receiveBuffer += chunk;

    // ELM327 responds ending with prompt character '>'
    if (this.receiveBuffer.includes('>')) {
      const fullResponse = this.receiveBuffer.replace(/>/g, '').trim();
      clearTimeout(this.commandTimeoutTimer);

      if (this.pendingResolver) {
        const resolve = this.pendingResolver;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        resolve(fullResponse);
      }
      this.receiveBuffer = '';
    }
  }

  public disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.commandTimeoutTimer) clearTimeout(this.commandTimeoutTimer);
    this.pendingResolver = null;
    this.pendingRejecter = null;
    this.server = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.receiveBuffer = '';
  }

  private log(direction: ATLogEntry['direction'], text: string): void {
    if (this.onLog) {
      this.onLog({ direction, text });
    }
  }
}
