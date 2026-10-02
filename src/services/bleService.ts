import type { ATLogEntry } from '../types/ble';
import { validateCommandSafety } from './obdbParser';

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
    return this.device?.name || 'Bluetooth LE OBD-II Adapter';
  }

  public async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Google Chrome, Microsoft Edge, or the Bluefy browser on iOS.'
      );
    }

    this.log('info', 'Scanning for BLE OBD-II adapters (OBDLink CX, Veepeak, Vgate, Carista, Generic BLE)...');

    try {
      // First attempt: search with targeted OBD filters
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

      // Fallback: If device has an uncommon broadcast name, request with acceptAllDevices
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

    this.log('info', 'BLE connection established. Running OBD-II initialization sequence...');
    await this.runInitSequence();
  }

  /**
   * Intelligently discovers the primary UART/Serial service and automatically
   * resolves TX (write) and RX (notify) characteristics across any BLE OBD dongle.
   */
  private async discoverServicesAndCharacteristics(): Promise<void> {
    if (!this.server) throw new Error('GATT server not connected');

    let activeService: BluetoothRemoteGATTService | null = null;

    // 1. Try known OBD services in priority order
    for (const serviceUuid of ALL_OBD_SERVICES) {
      try {
        const s = await this.server.getPrimaryService(serviceUuid);
        if (s) {
          activeService = s;
          this.log('info', `Matched primary service: ${serviceUuid}`);
          break;
        }
      } catch {
        // continue trying next service
      }
    }

    // 2. Fallback: inspect all services exposed by the device
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

    // 3. Inspect characteristics of the active service dynamically
    const characteristics = await activeService.getCharacteristics();
    let writeChar: BluetoothRemoteGATTCharacteristic | null = null;
    let notifyChar: BluetoothRemoteGATTCharacteristic | null = null;

    for (const c of characteristics) {
      const p = c.properties;
      // Look for write capability
      if (!writeChar && (p.write || p.writeWithoutResponse)) {
        writeChar = c;
      }
      // Look for notification capability
      if (!notifyChar && (p.notify || p.indicate)) {
        notifyChar = c;
      }
    }

    // If one characteristic handles bidirectional communication (e.g. TI CC2540 / HM-10 0xFFE1)
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

    // Setup notifications on RX
    await this.rxCharacteristic.startNotifications();
    this.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      this.handleRxData(event.target.value);
    });
  }

  /**
   * Universal OBD-II Adapter Initialization Sequence:
   * 1. AT Z   (Reset ELM327 / STN controller)
   * 2. AT E0  (Echo Off — ensures clean ECU response packets)
   * 3. AT SP 6 (ISO 15765-4 CAN 11-bit 500kbps, fallback to AT SP 0 Auto if unsupported)
   * 4. AT H1  (CAN Headers ON — required to identify ECU modules e.g. 7E0 vs 7E4)
   */
  public async runInitSequence(): Promise<void> {
    // 1. Reset
    this.log('tx', 'AT Z');
    try {
      const zResp = await this.sendCommand('AT Z', 4000);
      this.log('rx', zResp);
    } catch (err: any) {
      this.log('error', `Reset (AT Z) timed out or failed: ${err.message}`);
      this.disconnect();
      throw new Error(`Init command AT Z failed: ${err.message}`);
    }

    // Small stabilization delay after controller reboot
    await new Promise((r) => setTimeout(r, 200));

    // 2. Echo Off
    this.log('tx', 'AT E0');
    try {
      const eResp = await this.sendCommand('AT E0', 2500);
      this.log('rx', eResp);
    } catch {
      // Ignore if adapter rejects AT E0
    }

    // 3. Protocol Select (Try ISO 15765-4 11-bit 500k, fallback to Auto)
    this.log('tx', 'AT SP 6');
    try {
      const spResp = await this.sendCommand('AT SP 6', 3000);
      this.log('rx', spResp);
      if (spResp.includes('?') || spResp.includes('ERROR')) {
        // Fallback to automatic protocol detection
        this.log('info', 'AT SP 6 rejected. Trying AT SP 0 (Automatic protocol search)...');
        const autoResp = await this.sendCommand('AT SP 0', 3000);
        this.log('rx', autoResp);
      }
    } catch (err: any) {
      this.log('error', `Protocol select failed: ${err.message}`);
      this.disconnect();
      throw new Error(`Init command AT SP failed: ${err.message}`);
    }

    // 4. Headers On
    this.log('tx', 'AT H1');
    try {
      const hResp = await this.sendCommand('AT H1', 3000);
      this.log('rx', hResp);
    } catch (err: any) {
      this.log('error', `Headers ON (AT H1) failed: ${err.message}`);
      this.disconnect();
      throw new Error(`Init command AT H1 failed: ${err.message}`);
    }

    this.log('info', 'OBD-II Adapter initialized successfully (Headers ON, CAN protocol active)');
  }

  /**
   * Sends raw AT or OBD command and awaits response ending with ELM prompt character '>'.
   * Splits into 20-byte chunks to respect standard BLE ATT MTU limits across all dongles.
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

      // Safe chunked write (20-byte chunks prevent BLE buffer overflow on cheap chips)
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
          reject(writeErr);
        }
      };

      writeData();
    });
  }

  private handleRxData(dataView: DataView): void {
    const decoder = new TextDecoder();
    const chunk = decoder.decode(dataView);
    this.receiveBuffer += chunk;

    // ELM327 / STN controller responds ending with prompt character '>'
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
