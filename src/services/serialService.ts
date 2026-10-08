import type { ATLogEntry } from '../types/ble';
import { validateCommandSafety } from './obdbParser';
import { executeAdapterInit, type OBDTransport, type AdapterCapabilities } from './adapterInit';

export type SerialLogCallback = (entry: Omit<ATLogEntry, 'id' | 'timestamp'>) => void;

/**
 * SerialOBDService
 * Implements prompt-driven communication over the Web Serial API (Chrome 117+ on Mac, Windows, Linux, Android).
 * Supports:
 * - OBDLink MX+ (Bluetooth 3.0 Classic SPP / RFCOMM)
 * - OBDLink LX, OBDLink EX (USB), vLinker FD+ / MC+
 * - Generic Bluetooth Classic ELM327 adapters
 * - USB OBD-II diagnostic cables (FTDI, CH340, CP2102)
 */
export class SerialOBDService implements OBDTransport {
  private port: any = null;
  private reader: any = null;
  private keepReading = false;
  private readPromise: Promise<void> | null = null;

  private receiveBuffer = '';
  private pendingCmd: string | null = null;
  private pendingResolver: ((response: string) => void) | null = null;
  private pendingRejecter: ((err: Error) => void) | null = null;
  private commandTimeoutTimer: any = null;

  private capabilities: AdapterCapabilities | null = null;

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

  public getCapabilities(): AdapterCapabilities | null {
    return this.capabilities;
  }

  public getDeviceName(): string {
    if (this.capabilities?.identity && this.capabilities.identity !== 'ELM327 Compatible') {
      return this.capabilities.identity;
    }
    if (!this.port) return 'OBDLink MX+ / Bluetooth Classic / Serial';
    const info = this.port.getInfo ? this.port.getInfo() : {};
    if (info.bluetoothServiceClassId) {
      return 'OBDLink MX+ (Bluetooth Classic)';
    }
    if (info.usbVendorId) {
      return `USB OBD Adapter (VID: 0x${info.usbVendorId.toString(16).toUpperCase()})`;
    }
    return 'OBDLink MX+ / Serial OBD-II Adapter';
  }

  /**
   * Retrieves all ports currently granted permission by the user in this browser origin.
   */
  public async getAuthorizedPorts(): Promise<any[]> {
    if (!this.isSupported()) return [];
    try {
      const serialNav = (navigator as any).serial;
      return (await serialNav.getPorts?.()) || [];
    } catch {
      return [];
    }
  }

  /**
   * Forgets (revokes permissions for) all previously granted serial ports.
   */
  public async forgetAllPorts(): Promise<number> {
    if (!this.isSupported()) return 0;
    await this.disconnect();
    const ports = await this.getAuthorizedPorts();
    let count = 0;
    for (const p of ports) {
      try {
        if (typeof p.forget === 'function') {
          await p.forget();
          count++;
        }
      } catch (e) {
        console.warn('Failed to forget serial port:', e);
      }
    }
    this.log('info', `Cleared ${count} saved device permission(s).`);
    return count;
  }

  /**
   * Connect to an OBD adapter via Web Serial.
   */
  public async connect(
    subMode: 'classic' | 'usb' | 'all' = 'all',
    targetBaudRate = 115200,
    forceNewDevice = false,
    profileProtocol?: string
  ): Promise<AdapterCapabilities> {
    if (!this.isSupported()) {
      throw new Error(
        'Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera on Desktop or Android.'
      );
    }

    const serialNav = (navigator as any).serial;

    // Check if we can reuse an already authorized serial port without re-opening the chooser
    if (!forceNewDevice) {
      const authorizedPorts = await this.getAuthorizedPorts();
      // Filter for connected ports if supported by modern Chromium (port.connected !== false)
      const connectedPorts = authorizedPorts.filter((p: any) => p.connected !== false);
      if (connectedPorts.length > 0) {
        const candidate = connectedPorts[connectedPorts.length - 1];
        this.log('info', 'Connecting to previously authorized serial port...');
        this.port = candidate;
        try {
          return await this.openPort(targetBaudRate, profileProtocol);
        } catch (openErr: any) {
          this.log(
            'info',
            `Saved serial port could not be opened (${openErr.message}). Prompting for device selection...`
          );
          this.port = null;
        }
      } else if (authorizedPorts.length > 0) {
        this.log(
          'info',
          'Previously saved serial port is reported disconnected by OS. Prompting for device selection...'
        );
      }
    }

    const promptMsg =
      subMode === 'usb'
        ? 'Prompting for USB OBD-II cable (OBDLink EX/SX, FTDI, CH340)...'
        : 'Prompting for serial port (select your OBD adapter, e.g. cu.OBDLinkMX...)...';

    this.log('info', promptMsg);

    try {
      const requestOptions: any = {};

      if (subMode === 'usb') {
        requestOptions.filters = [
          { usbVendorId: 0x0403 }, // FTDI
          { usbVendorId: 0x1a86 }, // WCH CH340
          { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
          { usbVendorId: 0x067b }, // Prolific PL2303
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

    return await this.openPort(targetBaudRate, profileProtocol);
  }

  private async openPort(targetBaudRate: number, profileProtocol?: string): Promise<AdapterCapabilities> {
    this.log('info', `Opening serial communication link at ${targetBaudRate} baud...`);

    // Guard against calling open() on an already open port
    if (!this.port.readable) {
      try {
        await this.port.open({
          baudRate: targetBaudRate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          bufferSize: 8192,
        });
      } catch (openErr: any) {
        throw new Error(`Failed to open serial port: ${openErr.message}`);
      }
    }

    // Assert DTR / RTS control signals if supported
    try {
      if (typeof this.port.setSignals === 'function') {
        await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
      }
    } catch {
      // ignore
    }

    // Start background reading loop
    this.keepReading = true;
    this.readPromise = this.readLoop();

    this.log('info', 'Serial stream established. Running fast initialization sequence...');
    return await this.runInitSequence(profileProtocol);
  }

  private async readLoop(): Promise<void> {
    const textDecoder = new TextDecoder();

    while (this.port?.readable && this.keepReading) {
      let activeReader: any = null;
      try {
        activeReader = this.port.readable.getReader();
        this.reader = activeReader;

        while (this.keepReading) {
          const { value, done } = await activeReader.read();
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
        if (activeReader) {
          try {
            activeReader.releaseLock();
          } catch {
            // ignore
          }
        }
        if (this.reader === activeReader) {
          this.reader = null;
        }
      }
    }
  }

  private handleRxChunk(chunk: string): void {
    this.receiveBuffer += chunk;

    // Response completes when ELM327 prompt '>' character arrives
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

  /**
   * Flushes input buffer.
   */
  public flush(): void {
    this.receiveBuffer = '';
  }

  /**
   * Raw prompt-driven send implementation.
   * Flushes input, writes command, awaits prompt '>', strips echo, rejects on timeout.
   */
  public async send(cmd: string, timeoutMs = 2500): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Not connected to serial adapter');
    }

    if (this.pendingRejecter) {
      clearTimeout(this.commandTimeoutTimer);
      this.pendingRejecter(new Error('Cancelled by new command'));
      this.pendingResolver = null;
      this.pendingRejecter = null;
      this.pendingCmd = null;
    }

    // Flush input buffer before each send
    this.flush();
    const cleanCmd = cmd.trim();
    const formattedCmd = cleanCmd === '' ? '\r' : `${cleanCmd}\r`;
    const encoder = new TextEncoder();
    const data = encoder.encode(formattedCmd);

    return new Promise<string>(async (resolve, reject) => {
      this.pendingCmd = cleanCmd;
      this.pendingResolver = resolve;
      this.pendingRejecter = reject;

      this.commandTimeoutTimer = setTimeout(() => {
        this.pendingResolver = null;
        this.pendingRejecter = null;
        this.pendingCmd = null;
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for response to "${cmd}"`));
      }, timeoutMs);

      let writer: any = null;
      try {
        writer = this.port.writable.getWriter();
        await writer.write(data);
      } catch (writeErr: any) {
        clearTimeout(this.commandTimeoutTimer);
        this.pendingResolver = null;
        this.pendingRejecter = null;
        this.pendingCmd = null;
        reject(new Error(`Serial write failed: ${writeErr.message}`));
      } finally {
        if (writer) {
          try {
            writer.releaseLock();
          } catch {
            // ignore
          }
        }
      }
    });
  }

  /**
   * Sends an AT or OBD command with safety allowlist validation.
   */
  public async sendCommand(cmd: string, timeoutMs = 2500): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Not connected to serial adapter');
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

  public async disconnect(): Promise<void> {
    this.keepReading = false;

    if (this.pendingRejecter) {
      clearTimeout(this.commandTimeoutTimer);
      this.pendingRejecter(new Error('Serial adapter disconnected'));
      this.pendingResolver = null;
      this.pendingRejecter = null;
      this.pendingCmd = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // ignore
      }
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
      } catch (closeErr) {
        console.warn('Error closing serial port:', closeErr);
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
    this.pendingCmd = null;
    this.receiveBuffer = '';
  }

  public log(direction: ATLogEntry['direction'], text: string): void {
    if (this.onLog) {
      this.onLog({ direction, text });
    }
  }
}
