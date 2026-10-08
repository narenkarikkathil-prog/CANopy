import type { ATLogEntry } from '../types/ble';
import { validateCommandSafety } from './obdbParser';
import { executeAdapterInit, type OBDTransport, type AdapterCapabilities } from './adapterInit';

// Comprehensive catalog of BLE UUIDs used across commercial & hobbyist OBD-II dongles
// 1. Nordic Semiconductor UART Service (NUS) — Vgate iCar Pro, Veepeak OBDCheck BLE+, Konnwei, LELink, Tonwon
export const NORDIC_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NORDIC_UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write
export const NORDIC_UART_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify

// 2. Microchip / OBDLink CX / Veepeak OBDCheck BLE / Viecar / Generic BLE (0xFFF0)
export const MICROCHIP_FFF0_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const MICROCHIP_FFF1_CHAR = '0000fff1-0000-1000-8000-00805f9b34fb';
export const MICROCHIP_FFF2_CHAR = '0000fff2-0000-1000-8000-00805f9b34fb';

// 3. TI CC2540 / HM-10 / JDY / Vgate Dual Mode (0xFFE0)
export const TI_FFE0_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
export const TI_FFE1_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb';

// 4. Carista / LELink / Automotive Diagnostic Services (0x18F0, 0xFEE7, 0xE781)
export const CARISTA_18F0_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb';
export const FEE7_SERVICE = '0000fee7-0000-1000-8000-00805f9b34fb';
export const OBDLINK_E781_SERVICE = '0000e781-0000-1000-8000-00805f9b34fb';

// 5. ISSC Microchip Transparent Serial
export const ISSC_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
export const ISSC_TX = '49535343-8841-43f4-a8d4-ecbe34729bb3';
export const ISSC_RX = '49535343-1e4d-4bd9-ba61-23c647249616';

// 6. Device Information & Battery Services
export const DEVICE_INFO_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
export const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';

export const ALL_OBD_SERVICES: BluetoothServiceUUID[] = [
  NORDIC_UART_SERVICE,
  MICROCHIP_FFF0_SERVICE,
  TI_FFE0_SERVICE,
  CARISTA_18F0_SERVICE,
  FEE7_SERVICE,
  OBDLINK_E781_SERVICE,
  ISSC_SERVICE,
  0xfff0,
  0xffe0,
  0x18f0,
  0xfee7,
  0xe781,
  0x180a,
  0x180f,
];

export type BLELogCallback = (entry: Omit<ATLogEntry, 'id' | 'timestamp'>) => void;

export class BLEService implements OBDTransport {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private rxCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private receiveBuffer = '';
  private pendingCmd: string | null = null;
  private pendingResolver: ((response: string) => void) | null = null;
  private pendingRejecter: ((err: Error) => void) | null = null;
  private commandTimeoutTimer: any = null;

  private capabilities: AdapterCapabilities | null = null;

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

  public getCapabilities(): AdapterCapabilities | null {
    return this.capabilities;
  }

  public getDeviceName(): string {
    if (this.capabilities?.identity && this.capabilities.identity !== 'ELM327 Compatible') {
      return this.capabilities.identity;
    }
    return this.device?.name || 'Bluetooth LE OBD-II Adapter';
  }

  public async connect(profileProtocol?: string): Promise<AdapterCapabilities> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Google Chrome, Microsoft Edge, or the Bluefy browser on iOS.'
      );
    }

    this.log('info', 'Scanning for BLE OBD-II adapters (OBDLink CX, Veepeak, Vgate, Carista, Generic BLE)...');

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [NORDIC_UART_SERVICE] },
          { services: [MICROCHIP_FFF0_SERVICE] },
          { services: [TI_FFE0_SERVICE] },
          { services: [CARISTA_18F0_SERVICE] },
          { services: [FEE7_SERVICE] },
          { services: [OBDLINK_E781_SERVICE] },
          { services: [ISSC_SERVICE] },
          { services: [0xfff0] },
          { services: [0xffe0] },
          { services: [0x18f0] },
          { services: [0xfee7] },
          { namePrefix: 'OBD' },
          { namePrefix: 'obd' },
          { namePrefix: 'OBDLink' },
          { namePrefix: 'Veepeak' },
          { namePrefix: 'Vgate' },
          { namePrefix: 'vLinker' },
          { namePrefix: 'Carista' },
          { namePrefix: 'LELink' },
          { namePrefix: 'UniCarScan' },
          { namePrefix: 'Konnwei' },
          { namePrefix: 'Viecar' },
          { namePrefix: 'IOS-Vlink' },
          { namePrefix: 'Android-Vlink' },
          { namePrefix: 'ELM' },
          { namePrefix: 'iCar' },
          { namePrefix: 'BT' },
        ],
        optionalServices: ALL_OBD_SERVICES,
      });
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        throw new Error('Bluetooth device selection cancelled');
      }

      this.log('info', 'Searching all nearby Bluetooth devices...');
      try {
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ALL_OBD_SERVICES,
        });
      } catch (fallbackErr: any) {
        throw new Error(fallbackErr.message || 'No Bluetooth device selected');
      }
    }

    if (!this.device) {
      throw new Error('No Bluetooth device selected');
    }

    this.device.addEventListener('gattserverdisconnected', () => {
      this.log('error', 'GATT Server disconnected');
      this.cleanup();
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    });

    this.log('info', `Connecting to GATT Server on ${this.device.name || 'OBD-II Adapter'}...`);
    this.server = await this.device.gatt!.connect();

    this.log('info', 'Discovering GATT primary OBD services & characteristics...');
    await this.discoverServicesAndCharacteristics();

    this.log('info', 'BLE connection established. Running fast initialization sequence...');
    return await this.runInitSequence(profileProtocol);
  }

  private async discoverServicesAndCharacteristics(): Promise<void> {
    if (!this.server) throw new Error('GATT server not connected');

    let activeService: BluetoothRemoteGATTService | null = null;

    for (const serviceUuid of ALL_OBD_SERVICES) {
      try {
        const s = await this.server.getPrimaryService(serviceUuid);
        if (s) {
          activeService = s;
          this.log('info', `Matched primary service: ${serviceUuid}`);
          break;
        }
      } catch {
        // continue
      }
    }

    if (!activeService) {
      try {
        const allServices = await this.server.getPrimaryServices();
        if (allServices && allServices.length > 0) {
          activeService = allServices[0];
          this.log('info', `Using exposed service: ${activeService.uuid}`);
        }
      } catch (e: any) {
        this.log('error', `Failed to enumerate services: ${e.message}`);
      }
    }

    if (!activeService) {
      throw new Error('Could not discover a compatible OBD-II GATT serial service on this adapter.');
    }

    const characteristics = await activeService.getCharacteristics();
    let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
    let notifyChar: BluetoothRemoteGATTCharacteristic | null = null;

    for (const c of characteristics) {
      const p = c.properties;
      if (!writeChar && (p.write || p.writeWithoutResponse)) {
        writeChar = c;
      }
      if (!notifyChar && (p.notify || p.indicate)) {
        notifyChar = c;
      }
    }

    if (writeChar && !notifyChar && (writeChar.properties.notify || writeChar.properties.indicate)) {
      notifyChar = writeChar;
    } else if (notifyChar && !writeChar && (notifyChar.properties.write || notifyChar.properties.writeWithoutResponse)) {
      writeChar = notifyChar;
    }

    if (!writeChar || !notifyChar) {
      throw new Error('Adapter did not expose required read/write characteristics for OBD communication.');
    }

    this.txCharacteristic = writeChar;
    this.rxCharacteristic = notifyChar;

    this.log('info', `Configured TX (write): ${writeChar.uuid.slice(0, 8)}...`);
    this.log('info', `Configured RX (notify): ${notifyChar.uuid.slice(0, 8)}...`);

    await this.rxCharacteristic.startNotifications();
    this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      this.handleRxData(event.target.value);
    });
  }

  public flush(): void {
    this.receiveBuffer = '';
  }

  /**
   * Raw prompt-driven send implementation.
   * Flushes input, writes command in 20-byte chunks, awaits '>', strips echo, rejects on timeout.
   */
  public async send(cmd: string, timeoutMs = 2500): Promise<string> {
    if (!this.txCharacteristic || !this.server?.connected) {
      throw new Error('Not connected to BLE adapter');
    }

    if (this.pendingRejecter) {
      clearTimeout(this.commandTimeoutTimer);
      this.pendingRejecter(new Error('Cancelled by new command'));
      this.pendingResolver = null;
      this.pendingRejecter = null;
      this.pendingCmd = null;
    }

    this.flush();
    const cleanCmd = cmd.trim();
    const formattedCmd = cleanCmd === '' ? '\r' : `${cleanCmd}\r`;
    const encoder = new TextEncoder();
    const data = encoder.encode(formattedCmd);

    return new Promise<string>((resolve, reject) => {
      this.pendingCmd = cleanCmd;
      this.pendingResolver = resolve;
      this.pendingRejecter = reject;

      this.commandTimeoutTimer = setTimeout(() => {
        this.pendingResolver = null;
        this.pendingRejecter = null;
        this.pendingCmd = null;
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for response to "${cmd}"`));
      }, timeoutMs);

      const writeData = async () => {
        const char = this.txCharacteristic as any;
        const CHUNK_SIZE = 20;

        try {
          for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            if (typeof char?.writeValueWithoutResponse === 'function') {
              await char.writeValueWithoutResponse(chunk);
            } else if (typeof char?.writeValue === 'function') {
              await char.writeValue(chunk);
            } else if (typeof char?.writeValueWithResponse === 'function') {
              await char.writeValueWithResponse(chunk);
            } else {
              throw new Error('No write method available on Bluetooth characteristic');
            }
          }
        } catch (writeErr) {
          clearTimeout(this.commandTimeoutTimer);
          this.pendingResolver = null;
          this.pendingRejecter = null;
          this.pendingCmd = null;
          reject(writeErr);
        }
      };

      writeData();
    });
  }

  /**
   * Sends an AT or OBD command with safety allowlist verification.
   */
  public async sendCommand(cmd: string, timeoutMs = 2500): Promise<string> {
    if (!this.txCharacteristic || !this.server?.connected) {
      throw new Error('Not connected to BLE adapter');
    }

    const safety = validateCommandSafety(cmd);
    if (!safety.allowed) {
      this.log('error', `[Safety Blocked] ${safety.reason}`);
      throw new Error(`[OBDb Safety Hard Block] ${safety.reason}`);
    }

    return this.send(cmd, timeoutMs);
  }

  /**
   * Executes the fast, robust initialization sequence.
   */
  public async runInitSequence(profileProtocol?: string): Promise<AdapterCapabilities> {
    this.capabilities = await executeAdapterInit(this, profileProtocol);
    return this.capabilities;
  }

  private handleRxData(dataView: DataView): void {
    const decoder = new TextDecoder();
    const chunk = decoder.decode(dataView);
    this.receiveBuffer += chunk;

    if (this.receiveBuffer.includes('>')) {
      const promptIdx = this.receiveBuffer.indexOf('>');
      const raw = this.receiveBuffer.slice(0, promptIdx);
      this.receiveBuffer = this.receiveBuffer.slice(promptIdx + 1);

      clearTimeout(this.commandTimeoutTimer);

      if (this.pendingResolver) {
        const resolve = this.pendingResolver;
        const sentCmd = this.pendingCmd;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        this.pendingCmd = null;

        // Clean response: strip echo of command if present
        let cleaned = raw.replace(/\r+/g, '\r').trim();
        if (sentCmd && sentCmd.length > 0) {
          const lines = cleaned.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
          if (lines.length > 0 && lines[0].toUpperCase() === sentCmd.toUpperCase()) {
            cleaned = lines.slice(1).join('\r');
          }
        }
        resolve(cleaned.trim());
      }
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
    this.pendingCmd = null;
    this.server = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.receiveBuffer = '';
  }

  public log(direction: ATLogEntry['direction'], text: string): void {
    if (this.onLog) {
      this.onLog({ direction, text });
    }
  }
}
