import type { ATLogEntry } from '../types/ble';
import { validateCommandSafety } from './obdbParser';

export type SerialLogCallback = (entry: Omit<ATLogEntry, 'id' | 'timestamp'>) => void;

/**
 * SerialOBDService
 * Implements communication over the Web Serial API (Chrome 117+ on Mac, Windows, Linux, Android).
 * Specifically supports:
 * - OBDLink MX+ (Bluetooth 3.0 Classic SPP / RFCOMM)
 * - OBDLink LX, OBDLink EX (USB), vLinker FD+ / MC+
 * - Generic Bluetooth Classic ELM327 adapters
 * - USB OBD-II diagnostic cables (FTDI, CH340, CP2102)
 */
export class SerialOBDService {
  private port: any = null;
  private reader: any = null;
  private keepReading = false;
  private readPromise: Promise<void> | null = null;

  private receiveBuffer = '';
  private pendingResolver: ((response: string) => void) | null = null;
  private pendingRejecter: ((err: Error) => void) | null = null;
  private commandTimeoutTimer: any = null;

  private onLog: SerialLogCallback | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  constructor(onLog?: SerialLogCallback, onDisconnect?: () => void) {
    if (onLog) this.onLog = onLog;
    if (onDisconnect) this.onDisconnectCallback = onDisconnect;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public isConnected(): boolean {
    return !!(this.port && this.port.readable && this.port.writable);
  }

  public getDeviceName(): string {
    if (!this.port) return 'OBDLink MX+ / Bluetooth Classic / Serial';
    const info = this.port.getInfo ? this.port.getInfo() : {};
    if (info.bluetoothServiceClassId) {
      return 'OBDLink MX+ (Bluetooth Classic SPP)';
    }
    if (info.usbVendorId) {
      return `USB OBD Adapter (VID: 0x${info.usbVendorId.toString(16).toUpperCase()})`;
    }
    return 'OBDLink MX+ / Serial OBD-II Adapter';
  }

  public async connect(subMode: 'classic' | 'usb' | 'all' = 'all', targetBaudRate = 115200): Promise<void> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera on Desktop or Android.'
      );
    }

    const promptMsg =
      subMode === 'usb'
        ? 'Prompting for USB OBD-II cable (OBDLink EX/SX, FTDI, CH340)...'
        : subMode === 'classic'
        ? 'Prompting for Bluetooth Classic SPP adapter (OBDLink MX+, LX, vLinker)...'
        : 'Prompting for Bluetooth Classic / Serial port (OBDLink MX+, LX, vLinker, USB OBD cables)...';

    this.log('info', promptMsg);

    const serialNav = (navigator as any).serial;

    try {
      const requestOptions: any = {};
      if (subMode === 'classic') {
        requestOptions.allowedBluetoothServiceClassIds = [
          '00001101-0000-1000-8000-00805f9b34fb', // Standard Bluetooth Serial Port Profile (SPP)
          '00001105-0000-1000-8000-00805f9b34fb',
          '00001106-0000-1000-8000-00805f9b34fb',
        ];
      } else if (subMode === 'all') {
        requestOptions.allowedBluetoothServiceClassIds = [
          '00001101-0000-1000-8000-00805f9b34fb',
        ];
      }
      this.port = await serialNav.requestPort(requestOptions);
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        throw new Error('Device selection cancelled');
      }
      throw err;
    }

    if (!this.port) {
      throw new Error('No serial port selected');
    }

    this.log('info', `Opening serial communication link at ${targetBaudRate} baud...`);

    try {
      await this.port.open({
        baudRate: targetBaudRate, // 115,200 is default for OBDLink MX+, OBDLink EX, and STN chips
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 4096,
      });
    } catch (openErr: any) {
      // If 115200 failed and device might be an older 38400 baud ELM327
      if (targetBaudRate === 115200) {
        this.log('info', `115200 baud failed (${openErr.message}). Retrying at 38400 baud...`);
        try {
          await this.port.open({
            baudRate: 38400,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
          });
        } catch (retryErr: any) {
          throw new Error(`Failed to open serial port: ${retryErr.message}`);
        }
      } else {
        throw new Error(`Failed to open serial port: ${openErr.message}`);
      }
    }

    // Start asynchronous reading loop
    this.keepReading = true;
    this.readPromise = this.readLoop();

    this.log('info', 'Serial connection established. Running OBD-II initialization sequence...');
    await this.runInitSequence();
  }

  private async readLoop(): Promise<void> {
    const textDecoder = new TextDecoder();

    while (this.port?.readable && this.keepReading) {
      try {
        this.reader = this.port.readable.getReader();
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            const chunk = textDecoder.decode(value);
            this.handleRxChunk(chunk);
          }
        }
      } catch (err: any) {
        if (this.keepReading) {
          this.log('error', `Serial stream read error: ${err.message}`);
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch {
            // ignore
          }
          this.reader = null;
        }
      }
    }
  }

  private handleRxChunk(chunk: string): void {
    this.receiveBuffer += chunk;

    // Response completes when ELM327 prompt '>' character arrives
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

  /**
   * OBD-II Initialization Sequence:
   * 1. AT Z   (Reset controller)
   * 2. AT E0  (Echo off)
   * 3. AT SP 6 (ISO 15765-4 CAN 11/500, fallback to AT SP 0 Auto)
   * 4. AT H1  (Headers on)
   */
  public async runInitSequence(): Promise<void> {
    // 1. Reset
    this.log('tx', 'AT Z');
    try {
      const zResp = await this.sendCommand('AT Z', 4000);
      this.log('rx', zResp);
    } catch (err: any) {
      this.log('error', `Reset (AT Z) failed: ${err.message}`);
      this.disconnect();
      throw new Error(`Init command AT Z failed: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 200));

    // 2. Echo Off
    this.log('tx', 'AT E0');
    try {
      const eResp = await this.sendCommand('AT E0', 2500);
      this.log('rx', eResp);
    } catch {
      // Ignore if adapter rejects AT E0
    }

    // 3. Protocol Select
    this.log('tx', 'AT SP 6');
    try {
      const spResp = await this.sendCommand('AT SP 6', 3000);
      this.log('rx', spResp);
      if (spResp.includes('?') || spResp.includes('ERROR')) {
        this.log('info', 'AT SP 6 rejected. Falling back to AT SP 0 (Auto)...');
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

    this.log('info', 'OBDLink / Serial adapter initialized successfully (CAN protocol active, Headers ON)');
  }

  public async sendCommand(cmd: string, timeoutMs = 3000): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Not connected to serial adapter');
    }

    // Safety allowlist verification
    const safety = validateCommandSafety(cmd);
    if (!safety.allowed) {
      this.log('error', `[Safety Blocked] ${safety.reason}`);
      throw new Error(`[OBDb Safety Hard Block] ${safety.reason}`);
    }

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

    return new Promise<string>(async (resolve, reject) => {
      this.pendingResolver = resolve;
      this.pendingRejecter = reject;

      this.commandTimeoutTimer = setTimeout(() => {
        this.pendingResolver = null;
        this.pendingRejecter = null;
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for response to "${cmd}"`));
      }, timeoutMs);

      try {
        const writer = this.port.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
      } catch (writeErr: any) {
        clearTimeout(this.commandTimeoutTimer);
        this.pendingResolver = null;
        this.pendingRejecter = null;
        reject(new Error(`Serial write failed: ${writeErr.message}`));
      }
    });
  }

  public async disconnect(): Promise<void> {
    this.keepReading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // ignore
      }
      try {
        this.reader.releaseLock();
      } catch {
        // ignore
      }
      this.reader = null;
    }

    if (this.readPromise) {
      try {
        await this.readPromise;
      } catch {
        // ignore
      }
      this.readPromise = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // ignore
      }
      this.port = null;
    }

    this.cleanup();
    if (this.onDisconnectCallback) this.onDisconnectCallback();
  }

  private cleanup(): void {
    if (this.commandTimeoutTimer) clearTimeout(this.commandTimeoutTimer);
    this.pendingResolver = null;
    this.pendingRejecter = null;
    this.receiveBuffer = '';
  }

  private log(direction: ATLogEntry['direction'], text: string): void {
    if (this.onLog) {
      this.onLog({ direction, text });
    }
  }
}
