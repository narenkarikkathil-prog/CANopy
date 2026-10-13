import type { ATLogEntry } from '../types/ble';
import { validateCommandSafety } from './obdbParser';
import { executeAdapterInit, type OBDTransport, type AdapterCapabilities } from './adapterInit';

export type SerialLogCallback = (entry: Omit<ATLogEntry, 'id' | 'timestamp'>) => void;

/**
 * SerialOBDService
 * Implements robust, queue-serialized, prompt-driven communication over the Web Serial API.
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
  private onConnectCallback: ((deviceName: string, caps: AdapterCapabilities) => void) | null = null;

  // P4 queue & dirty flag
  private queue: Promise<unknown> = Promise.resolve();
  private dirty = false; // last command timed out; a late '>' may still arrive

  // P6 & P7 state
  private lastUsedPort: any = null;
  private lastProfileProtocol?: string;
  private userRequestedDisconnect = false;
  private autoReconnectAttempts = 0;
  private autoReconnectTimer: any = null;
  private enableSignals = false; // Opt-in DTR/RTS control signals
  private lastSubMode: 'classic' | 'usb' | 'all' = 'all';

  constructor(
    onLog?: SerialLogCallback,
    onDisconnect?: () => void,
    onConnect?: (deviceName: string, caps: AdapterCapabilities) => void
  ) {
    if (onLog) this.onLog = onLog;
    if (onDisconnect) this.onDisconnectCallback = onDisconnect;
    if (onConnect) this.onConnectCallback = onConnect;

    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      const serialNav = (navigator as any).serial;
      serialNav.addEventListener('disconnect', this.handleSerialDisconnectEvent);
      serialNav.addEventListener('connect', this.handleSerialConnectEvent);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handlePageUnload);
      window.addEventListener('pagehide', this.handlePageUnload);
    }
  }

  private handleSerialDisconnectEvent = (e: any) => {
    const info = e.target?.getInfo ? e.target.getInfo() : {};
    this.log(
      'info',
      `[Serial Hardware Disconnect] Device detached (VID: 0x${(info.usbVendorId || 0).toString(16).toUpperCase()})`
    );
    if (e.target === this.port) {
      this.handleLost('Device disconnected');
    }
  };

  private handleSerialConnectEvent = (e: any) => {
    const info = e.target?.getInfo ? e.target.getInfo() : {};
    this.log(
      'info',
      `[Serial Hardware Connect] Device attached (VID: 0x${(info.usbVendorId || 0).toString(16).toUpperCase()} PID: 0x${(info.usbProductId || 0).toString(16).toUpperCase()})`
    );
  };

  private handlePageUnload = () => {
    this.userRequestedDisconnect = true;
    this.keepReading = false;
    if (this.port) {
      try {
        this.port.close();
      } catch {}
    }
  };

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

  public setEnableSignals(enable: boolean): void {
    this.enableSignals = enable;
  }

  public setOnConnect(callback: (deviceName: string, caps: AdapterCapabilities) => void): void {
    this.onConnectCallback = callback;
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

  private getCachedBaud(info: any): number | null {
    if (typeof localStorage === 'undefined') return null;
    if (info?.usbVendorId) {
      const key = `obd_baud_${info.usbVendorId}_${info.usbProductId || '0'}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return null;
  }

  private setCachedBaud(info: any, baud: number): void {
    if (typeof localStorage === 'undefined') return;
    if (info?.usbVendorId) {
      const key = `obd_baud_${info.usbVendorId}_${info.usbProductId || '0'}`;
      localStorage.setItem(key, String(baud));
    }
  }

  private saveLastDevice(port: any): void {
    if (typeof localStorage === 'undefined' || !port) return;
    const info = port.getInfo ? port.getInfo() : {};
    localStorage.setItem(
      'obd_last_device',
      JSON.stringify({
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        bluetoothServiceClassId: info.bluetoothServiceClassId,
        subMode: this.lastSubMode,
        isBluetooth:
          this.lastSubMode === 'classic' ||
          !!info.bluetoothServiceClassId ||
          (!info.usbVendorId && !info.usbProductId),
      })
    );
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

    this.lastSubMode = subMode;

    // P1: Never leave the port open or locked after a failure
    if (this.port) {
      await this.teardownPort();
    }

    this.userRequestedDisconnect = false;
    this.autoReconnectAttempts = 0;
    if (this.autoReconnectTimer) {
      clearTimeout(this.autoReconnectTimer);
      this.autoReconnectTimer = null;
    }

    const serialNav = (navigator as any).serial;

    // P7: Reuse a saved port ONLY if getInfo() matches the last successful connection
    if (!forceNewDevice) {
      const authorizedPorts = await this.getAuthorizedPorts();
      const connectedPorts = authorizedPorts.filter((p: any) => p.connected !== false);
      const lastDeviceStr = typeof localStorage !== 'undefined' ? localStorage.getItem('obd_last_device') : null;

      if (lastDeviceStr && connectedPorts.length > 0) {
        try {
          const lastDevice = JSON.parse(lastDeviceStr);
          const candidate = connectedPorts.find((p: any) => {
            const info = p.getInfo ? p.getInfo() : {};
            if (
              lastDevice.bluetoothServiceClassId &&
              info.bluetoothServiceClassId === lastDevice.bluetoothServiceClassId
            ) {
              return true;
            }
            if (lastDevice.usbVendorId && info.usbVendorId === lastDevice.usbVendorId) {
              return !lastDevice.usbProductId || info.usbProductId === lastDevice.usbProductId;
            }
            // Bluetooth Classic on macOS exposes virtual RFCOMM ports without usbVendorId
            if (lastDevice.isBluetooth && (!info.usbVendorId || !info.usbProductId)) {
              return true;
            }
            return false;
          });

          if (candidate) {
            this.log('info', 'Connecting to last-used serial device...');
            this.port = candidate;
            try {
              return await this.openPort(targetBaudRate, profileProtocol);
            } catch (openErr: any) {
              this.log(
                'info',
                `Last-used serial device could not be opened (${openErr.message}). Prompting for device selection...`
              );
              await this.teardownPort();
            }
          }
        } catch {}
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

  /**
   * Opens the port with baud-rate fallback for USB adapters and error wrapping.
   */
  private async openPort(targetBaudRate: number, profileProtocol?: string): Promise<AdapterCapabilities> {
    try {
      const info = this.port.getInfo ? this.port.getInfo() : {};
      const isBluetooth =
        this.lastSubMode === 'classic' ||
        !!info.bluetoothServiceClassId ||
        (!info.usbVendorId && !info.usbProductId);

      if (isBluetooth) {
        this.log('info', `[Serial Port Open] Opening Bluetooth Classic port at ${targetBaudRate} baud...`);
        if (!this.port.readable) {
          await this.port.open({
            baudRate: targetBaudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 8192,
          });
        }
        if (this.enableSignals && typeof this.port.setSignals === 'function') {
          try {
            await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
          } catch {}
        }
        this.keepReading = true;
        this.readPromise = this.readLoop();
        this.log('info', '[Serial] Bluetooth link established. Running initialization sequence...');
        const caps = await this.runInitSequence(profileProtocol);
        this.lastUsedPort = this.port;
        this.lastProfileProtocol = profileProtocol;
        this.saveLastDevice(this.port);
        return caps;
      }

      // Non-Bluetooth / USB Cable: Baud-rate fallback probing (P6)
      const cachedBaud = this.getCachedBaud(info);
      const candidateBauds = [cachedBaud, targetBaudRate, 38400, 9600, 500000].filter(
        (b, idx, arr): b is number => !!b && arr.indexOf(b) === idx
      );

      let verifiedBaud: number | null = null;

      for (const baud of candidateBauds) {
        this.log('info', `[Serial Port Open] Testing baud rate ${baud}...`);
        let portOpened = false;
        try {
          if (!this.port.readable) {
            await this.port.open({
              baudRate: baud,
              dataBits: 8,
              stopBits: 1,
              parity: 'none',
              bufferSize: 8192,
            });
            portOpened = true;
          }

          if (this.enableSignals && typeof this.port.setSignals === 'function') {
            try {
              await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
            } catch {}
          }

          this.keepReading = true;
          this.readPromise = this.readLoop();

          // Send \r twice with 600ms timeout
          let ok = false;
          try {
            await this.send('\r', 600);
            ok = true;
          } catch {
            try {
              await this.send('\r', 600);
              ok = true;
            } catch {}
          }

          if (ok) {
            verifiedBaud = baud;
            this.log('info', `[Serial] Confirmed working baud rate: ${baud}`);
            this.setCachedBaud(info, baud);
            break;
          }

          // Not responsive on this baud; teardown read loop and close port, then test next
          this.log('info', `[Serial] No response at ${baud} baud, testing next rate...`);
          this.keepReading = false;
          if (this.reader) {
            try {
              await this.reader.cancel();
            } catch {}
            this.reader = null;
          }
          if (this.readPromise) {
            try {
              await this.readPromise;
            } catch {}
            this.readPromise = null;
          }
          if (portOpened && this.port) {
            try {
              await this.port.close();
            } catch {}
          }
          this.cleanup();
        } catch (err: any) {
          this.log('info', `[Serial] Baud ${baud} test error: ${err.message}`);
          this.keepReading = false;
          if (this.reader) {
            try {
              await this.reader.cancel();
            } catch {}
            this.reader = null;
          }
          if (this.readPromise) {
            try {
              await this.readPromise;
            } catch {}
            this.readPromise = null;
          }
          if (portOpened && this.port) {
            try {
              await this.port.close();
            } catch {}
          }
          this.cleanup();
        }
      }

      if (!verifiedBaud) {
        throw new Error(`Failed to find responsive baud rate among: ${candidateBauds.join(', ')}`);
      }

      this.log('info', `[Serial] Link established at ${verifiedBaud} baud. Running initialization sequence...`);
      const caps = await this.runInitSequence(profileProtocol);
      this.lastUsedPort = this.port;
      this.lastProfileProtocol = profileProtocol;
      this.saveLastDevice(this.port);
      return caps;
    } catch (e) {
      await this.teardownPort();
      throw e;
    }
  }

  /**
   * P2: Resilient background read loop surviving non-fatal stream errors.
   */
  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    let missing = 0;
    while (this.keepReading && this.port) {
      const readable = this.port.readable;
      if (!readable) {
        // Chrome is swapping in a new stream
        if (++missing > 40) break; // ~2 s, then treat as lost
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }
      missing = 0;
      let reader: any;
      try {
        reader = readable.getReader();
      } catch {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      this.reader = reader;
      try {
        while (this.keepReading) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.handleRxChunk(decoder.decode(value, { stream: true }));
        }
      } catch (err: any) {
        if (this.keepReading) this.log('error', `Serial read error (${err.name}): ${err.message}`);
      } finally {
        try {
          reader.releaseLock();
        } catch {}
        this.reader = null;
      }
    }
    if (this.keepReading) await this.handleLost('Serial stream ended unexpectedly');
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
   * Raw prompt-driven send implementation without cancel-previous-command block.
   */
  private async sendNow(cmd: string, timeoutMs = 2500): Promise<string> {
    if (!this.isConnected()) {
      throw new Error('Not connected to serial adapter');
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
   * P4: Serializes all send() calls through an execution queue with timeout dirty protection.
   */
  public send(cmd: string, timeoutMs = 2500): Promise<string> {
    const run = async () => {
      if (this.dirty) {
        await new Promise((r) => setTimeout(r, 300));
        this.flush();
        this.dirty = false;
      }
      try {
        return await this.sendNow(cmd, timeoutMs);
      } catch (e: any) {
        if (String(e.message).startsWith('Timeout')) this.dirty = true;
        throw e;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p as Promise<string>;
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

  /**
   * Reconnects to the last-used port with its cached baud rate.
   */
  public async reconnect(profileProtocol?: string): Promise<AdapterCapabilities> {
    this.userRequestedDisconnect = false;
    await this.teardownPort();

    const authorizedPorts = await this.getAuthorizedPorts();
    const lastDeviceStr = typeof localStorage !== 'undefined' ? localStorage.getItem('obd_last_device') : null;
    let candidate: any = null;

    if (lastDeviceStr) {
      try {
        const lastDevice = JSON.parse(lastDeviceStr);
        if (lastDevice.subMode) {
          this.lastSubMode = lastDevice.subMode;
        }
        candidate = authorizedPorts.find((p: any) => {
          const info = p.getInfo ? p.getInfo() : {};
          if (
            lastDevice.bluetoothServiceClassId &&
            info.bluetoothServiceClassId === lastDevice.bluetoothServiceClassId
          ) {
            return true;
          }
          if (lastDevice.usbVendorId && info.usbVendorId === lastDevice.usbVendorId) {
            return !lastDevice.usbProductId || info.usbProductId === lastDevice.usbProductId;
          }
          if (lastDevice.isBluetooth && (!info.usbVendorId || !info.usbProductId)) {
            return true;
          }
          return false;
        });
      } catch {}
    }

    if (!candidate && this.lastUsedPort) {
      candidate = this.lastUsedPort;
    }

    if (!candidate && authorizedPorts.length > 0) {
      candidate = authorizedPorts[authorizedPorts.length - 1];
    }

    if (!candidate) {
      throw new Error('No serial port available to reconnect');
    }

    this.port = candidate;
    const proto = profileProtocol || this.lastProfileProtocol || '6';
    const info = this.port.getInfo ? this.port.getInfo() : {};
    const cachedBaud = this.getCachedBaud(info) || 115200;

    const caps = await this.openPort(cachedBaud, proto);
    this.autoReconnectAttempts = 0;
    return caps;
  }

  /**
   * P1: Complete port teardown ensuring no open port, active reader, or dangling promise.
   */
  public async teardownPort(): Promise<void> {
    this.keepReading = false;

    if (this.pendingRejecter) {
      clearTimeout(this.commandTimeoutTimer);
      this.pendingRejecter(new Error('Serial port teardown'));
      this.pendingResolver = null;
      this.pendingRejecter = null;
      this.pendingCmd = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {}
      this.reader = null;
    }

    if (this.readPromise) {
      try {
        await this.readPromise;
      } catch {}
      this.readPromise = null;
    }

    if (this.port) {
      try {
        await this.port.close();
        this.log('info', '[Serial Port Close] Port closed cleanly.');
      } catch (closeErr) {
        console.warn('Error closing serial port:', closeErr);
      }
      this.port = null;
    }

    this.cleanup();
  }

  /**
   * P3: Handles unexpected disconnection with backoff auto-reconnect.
   */
  public async handleLost(reason: string): Promise<void> {
    this.log('error', `[Serial Disconnect] Reason: ${reason}`);
    await this.teardownPort();
    if (this.onDisconnectCallback) this.onDisconnectCallback();

    if (!this.userRequestedDisconnect && this.autoReconnectAttempts < 3) {
      const delays = [1000, 2000, 4000];
      const delay = delays[this.autoReconnectAttempts] || 4000;
      this.autoReconnectAttempts++;
      this.log('info', `[Auto-Reconnect] Lost connection. Reconnecting in ${delay}ms (attempt ${this.autoReconnectAttempts}/3)...`);
      this.autoReconnectTimer = setTimeout(async () => {
        if (this.userRequestedDisconnect) return;
        try {
          const caps = await this.reconnect();
          this.log('info', `[Auto-Reconnect] Successfully reconnected to ${this.getDeviceName()}`);
          if (this.onConnectCallback) {
            this.onConnectCallback(this.getDeviceName(), caps);
          }
        } catch (err: any) {
          this.log('error', `[Auto-Reconnect] Attempt ${this.autoReconnectAttempts} failed: ${err.message}`);
        }
      }, delay);
    }
  }

  public async disconnect(): Promise<void> {
    this.userRequestedDisconnect = true;
    if (this.autoReconnectTimer) {
      clearTimeout(this.autoReconnectTimer);
      this.autoReconnectTimer = null;
    }
    this.autoReconnectAttempts = 0;
    await this.teardownPort();
    if (this.onDisconnectCallback) this.onDisconnectCallback();
  }

  private cleanup(): void {
    if (this.commandTimeoutTimer) clearTimeout(this.commandTimeoutTimer);
    this.commandTimeoutTimer = null;
    this.pendingResolver = null;
    this.pendingRejecter = null;
    this.pendingCmd = null;
    this.receiveBuffer = '';
    this.queue = Promise.resolve();
    this.dirty = false;
  }

  public log(direction: ATLogEntry['direction'], text: string): void {
    if (this.onLog) {
      this.onLog({ direction, text });
    }
  }

  public destroy(): void {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      const serialNav = (navigator as any).serial;
      try {
        serialNav.removeEventListener('disconnect', this.handleSerialDisconnectEvent);
        serialNav.removeEventListener('connect', this.handleSerialConnectEvent);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      try {
        window.removeEventListener('beforeunload', this.handlePageUnload);
        window.removeEventListener('pagehide', this.handlePageUnload);
      } catch {}
    }
    this.disconnect();
  }
}
