import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { BLEConnectionStatus, ATLogEntry, ConnectionType } from '../types/ble';
import type { LiveTelemetryMap, HistoryBufferMap, OBDCommand } from '../types/telemetry';
import { BLEService } from '../services/bleService';
import { SerialOBDService } from '../services/serialService';
import { MockBLEService } from '../services/mockBleService';
import type { AdapterCapabilities } from '../services/adapterInit';
import { useVehicle } from './VehicleContext';
import { useWidgets } from './WidgetContext';
import { parseAndEvaluateResponse, isUnsupportedResponse } from '../services/obdParser';
import { validateCommandSafety, decodeOBDbSignal } from '../services/obdbParser';
import { evaluateFormula } from '../services/formulaParser';

interface BLEContextType {
  status: BLEConnectionStatus;
  connectionType: ConnectionType;
  deviceName: string | null;
  isSimulated: boolean;
  setIsSimulated: (simulated: boolean) => void;
  isBLESupported: boolean;
  isSerialSupported: boolean;
  atLogs: ATLogEntry[];
  liveValues: LiveTelemetryMap;
  historyBuffers: HistoryBufferMap;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  batteryGuardActive: boolean;
  batteryVoltage12V: number | null;
  unsupportedSignals: Set<string>;
  connect: (mode?: ConnectionType, forceNew?: boolean) => Promise<void>;
  connectBLE: () => Promise<void>;
  connectClassic: (forceNew?: boolean) => Promise<void>;
  connectUSB: (forceNew?: boolean) => Promise<void>;
  connectSerial: (subMode?: 'classic' | 'usb', forceNew?: boolean) => Promise<void>;
  forgetSavedDevices: () => Promise<number>;
  disconnect: () => void;
  quickReconnect: () => Promise<void>;
  sendManualCommand: (cmd: string) => Promise<string>;
  clearLogs: () => void;
}

const BLEContext = createContext<BLEContextType | null>(null);

const MAX_HISTORY_POINTS = 120; // 60-120 seconds rolling window

// Standard SAE J1979 Mode 01 data byte lengths for batch parsing
const MODE_01_PID_LENGTHS: Record<string, number> = {
  '04': 1, '05': 1, '0B': 1, '0C': 2, '0D': 1, '0E': 1, '0F': 1,
  '10': 2, '11': 1, '1F': 2, '2F': 1, '33': 1, '42': 2, '5C': 1,
};

/**
 * Returns true if signal is highly dynamic (fast tier: polled every cycle).
 * Slow tier signals (temperatures, SOC, fuel, pressure) are polled every 3rd cycle.
 */
function isFastSignal(cmd: OBDCommand): boolean {
  const text = `${cmd.commandName} ${cmd.units} ${cmd.modePid}`.toLowerCase();
  return (
    text.includes('rpm') ||
    text.includes('speed') ||
    text.includes('current') ||
    text.includes('throttle') ||
    text.includes('accel') ||
    text.includes('power') ||
    text.includes('torque') ||
    cmd.modePid === '010C' ||
    cmd.modePid === '010D'
  );
}

/**
 * Appends single expected response count digit where valid (e.g. 010C1, 2248021)
 * so ELM327 does not wait out its full receive timeout.
 */
function formatWireCommand(modePid: string, supportsCount: boolean): string {
  if (!supportsCount) return modePid;
  const clean = modePid.replace(/\s+/g, '').toUpperCase();
  // Standard Mode 01 single PID
  if (clean.length === 4 && clean.startsWith('01')) {
    return `${clean}1`;
  }
  // Mode 22 UDS single PID
  if (clean.length === 6 && clean.startsWith('22')) {
    return `${clean}1`;
  }
  return modePid;
}

export const BLEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { availableCommands, activeVehicle } = useVehicle();
  const { widgets } = useWidgets();

  const [status, setStatus] = useState<BLEConnectionStatus>('disconnected');
  const [connectionType, setConnectionType] = useState<ConnectionType>('ble');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [isSimulated, setIsSimulatedState] = useState<boolean>(false);
  const [atLogs, setAtLogs] = useState<ATLogEntry[]>([]);
  const [liveValues, setLiveValues] = useState<LiveTelemetryMap>({});
  const [historyBuffers, setHistoryBuffers] = useState<HistoryBufferMap>({});
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [batteryGuardActive, setBatteryGuardActive] = useState<boolean>(false);
  const [batteryVoltage12V, setBatteryVoltage12V] = useState<number | null>(null);
  const [unsupportedSignals, setUnsupportedSignals] = useState<Set<string>>(new Set());

  const bleServiceRef = useRef<BLEService | null>(null);
  const serialServiceRef = useRef<SerialOBDService | null>(null);
  const mockServiceRef = useRef<MockBLEService | null>(null);
  const capabilitiesRef = useRef<AdapterCapabilities | null>(null);

  const isPollingRef = useRef<boolean>(false);
  const activeHeaderRef = useRef<string>('7E0');
  const availableCommandsRef = useRef(availableCommands);
  availableCommandsRef.current = availableCommands;
  const unsupportedSignalsRef = useRef<Set<string>>(new Set());

  const isBLESupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const isSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const addLog = useCallback((direction: ATLogEntry['direction'], text: string) => {
    const entry: ATLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      direction,
      text,
    };
    setAtLogs((prev) => [...prev.slice(-300), entry]);
  }, []);

  const clearLogs = useCallback(() => {
    setAtLogs([]);
  }, []);

  // Initialize transport service instances
  useEffect(() => {
    bleServiceRef.current = new BLEService(
      (entry) => addLog(entry.direction, entry.text),
      () => {
        setStatus('disconnected');
        setDeviceName(null);
        isPollingRef.current = false;
      }
    );

    serialServiceRef.current = new SerialOBDService(
      (entry) => addLog(entry.direction, entry.text),
      () => {
        setStatus('disconnected');
        setDeviceName(null);
        isPollingRef.current = false;
      }
    );

    mockServiceRef.current = new MockBLEService(
      (entry) => addLog(entry.direction, entry.text),
      () => {
        setStatus('disconnected');
        setDeviceName(null);
        isPollingRef.current = false;
      },
      () => availableCommandsRef.current
    );

    return () => {
      bleServiceRef.current?.disconnect();
      serialServiceRef.current?.disconnect();
      mockServiceRef.current?.disconnect();
    };
  }, [addLog]);

  useEffect(() => {
    mockServiceRef.current?.setCommandProvider(() => availableCommandsRef.current);
  }, [availableCommands]);

  const getActiveService = useCallback(() => {
    if (isSimulated || connectionType === 'simulated') return mockServiceRef.current;
    if (connectionType === 'serial' || connectionType === 'classic' || connectionType === 'usb') return serialServiceRef.current;
    return bleServiceRef.current;
  }, [isSimulated, connectionType]);

  // Connect handler supporting BLE, Bluetooth Classic (OBDLink MX+), USB Serial, and Simulation
  const connect = useCallback(
    async (mode?: ConnectionType, forceNew = false) => {
      const targetMode = isSimulated ? 'simulated' : (mode || connectionType);
      setConnectionType(targetMode);
      setStatus('connecting');

      const isSerialKind = targetMode === 'serial' || targetMode === 'classic' || targetMode === 'usb';
      const service =
        targetMode === 'simulated'
          ? mockServiceRef.current
          : isSerialKind
          ? serialServiceRef.current
          : bleServiceRef.current;

      if (!service) return;

      const label =
        targetMode === 'classic'
          ? 'Bluetooth Classic (OBDLink MX+)'
          : targetMode === 'usb'
          ? 'USB Diagnostic Cable'
          : targetMode === 'serial'
          ? 'Bluetooth Classic / USB Serial'
          : targetMode === 'simulated'
          ? 'Simulated BLE Adapter'
          : 'Bluetooth Low Energy (BLE)';

      addLog('info', `Initiating connection via ${label}...`);

      try {
        let caps: AdapterCapabilities | null = null;
        const profileProto = activeVehicle?.protocol || '6';

        if (isSerialKind && serialServiceRef.current) {
          const subMode = targetMode === 'classic' ? 'classic' : targetMode === 'usb' ? 'usb' : 'all';
          caps = await serialServiceRef.current.connect(subMode, 115200, forceNew, profileProto);
        } else if (service instanceof BLEService) {
          caps = await service.connect(profileProto);
        } else {
          await service.connect();
          caps = (service as any).getCapabilities ? (service as any).getCapabilities() : null;
        }

        if (caps) {
          capabilitiesRef.current = caps;
        }

        setStatus('connected');
        const resolvedName =
          service.getDeviceName() ||
          (targetMode === 'classic'
            ? 'OBDLink MX+ (Classic)'
            : targetMode === 'usb'
            ? 'USB OBD Cable'
            : targetMode === 'serial'
            ? 'OBDLink MX+'
            : targetMode === 'simulated'
            ? 'Simulated BLE Adapter'
            : 'OBD-II Adapter');
        setDeviceName(resolvedName);
        addLog('info', `Connected to ${resolvedName}. Telemetry polling active.`);
      } catch (err: any) {
        console.warn('Connection failed:', err);
        setStatus('disconnected');
        setDeviceName(null);
        addLog('error', `Connection error: ${err.message || 'Failed'}`);
      }
    },
    [connectionType, isSimulated, activeVehicle, addLog]
  );

  const connectBLE = useCallback(() => connect('ble'), [connect]);
  const connectClassic = useCallback((forceNew = false) => connect('classic', forceNew), [connect]);
  const connectUSB = useCallback((forceNew = false) => connect('usb', forceNew), [connect]);
  const connectSerial = useCallback(
    (subMode?: 'classic' | 'usb', forceNew = false) => connect(subMode || 'serial', forceNew),
    [connect]
  );

  const forgetSavedDevices = useCallback(async (): Promise<number> => {
    addLog('info', 'Revoking saved serial/Bluetooth device permissions in browser...');
    const count = (await serialServiceRef.current?.forgetAllPorts()) || 0;
    setStatus('disconnected');
    setDeviceName(null);
    return count;
  }, [addLog]);

  const disconnect = useCallback(() => {
    bleServiceRef.current?.disconnect();
    serialServiceRef.current?.disconnect();
    mockServiceRef.current?.disconnect();
    setStatus('disconnected');
    setDeviceName(null);
    isPollingRef.current = false;
  }, []);

  const quickReconnect = useCallback(async () => {
    addLog('info', 'Quick-reconnect triggered: restarting initialization sequence...');
    setStatus('connecting');
    const service = getActiveService();
    if (!service) return;

    try {
      const profileProto = activeVehicle?.protocol || '6';
      if (!service.isConnected()) {
        await (service as any).connect(profileProto);
      } else {
        const caps = await (service as any).runInitSequence(profileProto);
        if (caps) capabilitiesRef.current = caps;
      }
      setStatus('connected');
      setDeviceName(service.getDeviceName() || null);
    } catch (err: any) {
      setStatus('disconnected');
      setDeviceName(null);
      addLog('error', `Quick-reconnect failed: ${err.message}`);
    }
  }, [getActiveService, activeVehicle, addLog]);

  const setIsSimulated = useCallback((sim: boolean) => {
    disconnect();
    setIsSimulatedState(sim);
    if (sim) setConnectionType('simulated');
    else setConnectionType('ble');
  }, [disconnect]);

  const sendManualCommand = useCallback(
    async (cmd: string): Promise<string> => {
      const service = getActiveService();
      if (!service || !service.isConnected()) {
        throw new Error('Adapter is not connected');
      }

      const safety = validateCommandSafety(cmd);
      if (!safety.allowed) {
        addLog('error', `[Safety Blocked] ${safety.reason}`);
        throw new Error(safety.reason);
      }

      addLog('tx', cmd);
      try {
        const resp = await service.sendCommand(cmd);
        addLog('rx', resp);
        return resp;
      } catch (err: any) {
        addLog('error', err.message);
        throw err;
      }
    },
    [getActiveService, addLog]
  );

  // Fast, Adaptive Polling Loop
  useEffect(() => {
    if (status !== 'connected') {
      isPollingRef.current = false;
      return;
    }

    isPollingRef.current = true;
    let cancel = false;

    // Collect PIDs to poll:
    // 1. Attached to active widgets
    // 2. Custom commands if drawer is open
    const activeCommandIds = new Set<string>();

    widgets.forEach((w) => {
      if (w.signalSourceId) {
        const directCmd = availableCommands.find((c) => c.id === w.signalSourceId);
        if (directCmd) {
          activeCommandIds.add(directCmd.id);
        } else {
          const rawSig = w.signalSourceId.replace(/^[^_]+_/, '');
          const fallback = availableCommands.find((c) => c.id.endsWith(rawSig) || c.modePid === w.signalSourceId);
          if (fallback) activeCommandIds.add(fallback.id);
        }
      }
    });

    if (isDrawerOpen) {
      availableCommands
        .filter((c) => c.isCustom)
        .forEach((c) => activeCommandIds.add(c.id));
    }

    const commandsToPoll = availableCommands.filter((c) => activeCommandIds.has(c.id));
    if (commandsToPoll.length === 0) {
      return;
    }

    const pollLoop = async () => {
      const service = getActiveService();
      let loopCounter = 0;
      let batchingSupported = true;

      while (!cancel && isPollingRef.current && service?.isConnected()) {
        loopCounter++;

        // 1. Battery Guard: Check 12V voltage every 20 cycles
        if (loopCounter % 20 === 1) {
          try {
            const rvResp = await service.sendCommand('AT RV', 1200);
            const voltsMatch = rvResp.match(/([0-9.]+)\s*V/i);
            if (voltsMatch) {
              const volts = parseFloat(voltsMatch[1]);
              setBatteryVoltage12V(volts);

              // Low 12V voltage guard (< 11.8V indicates weak battery or ignition OFF)
              if (volts > 0 && volts < 11.8) {
                setBatteryGuardActive(true);
                addLog('info', `[Battery Guard] 12V battery is low (${volts}V). Pausing polling to protect battery.`);
                await new Promise((r) => setTimeout(r, 10000));
                continue;
              } else {
                setBatteryGuardActive(false);
              }
            }
          } catch {
            // continue
          }
        }

        // 2. Tiered selection: Fast signals every cycle; slow signals every 3rd cycle
        const dueCommands = commandsToPoll.filter((cmd) => {
          if (unsupportedSignalsRef.current.has(cmd.id)) return false;
          if (isFastSignal(cmd)) return true;
          return loopCounter % 3 === 0;
        });

        if (dueCommands.length === 0) {
          // If no slow signals are due, pick one fast command or sleep briefly
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }

        const caps = capabilitiesRef.current;
        const supportsCount = caps ? caps.supportsResponseCount : true;

        // 3. Check for standard Mode 01 multi-PID batching (up to 6 PIDs per query)
        const mode01Candidates = dueCommands.filter(
          (c) => /^01[0-9A-Fa-f]{2}$/i.test(c.modePid) && (!c.header || c.header === '7E0')
        );

        const batchedHandledIds = new Set<string>();

        if (batchingSupported && mode01Candidates.length >= 2) {
          const batchSlice = mode01Candidates.slice(0, 6);
          const pidsOnly = batchSlice.map((c) => c.modePid.slice(2).toUpperCase());
          const batchedWireCmd = `01 ${pidsOnly.join(' ')}${supportsCount ? ' 1' : ''}`;

          try {
            // Ensure header is standard 7E0
            if (activeHeaderRef.current !== '7E0') {
              await service.sendCommand('AT SH 7E0', 1000);
              activeHeaderRef.current = '7E0';
            }

            const batchResp = await service.sendCommand(batchedWireCmd, 1500);

            if (isUnsupportedResponse(batchResp) || batchResp.includes('?')) {
              // Adapter or ECU rejected batch query -> revert to single PIDs
              batchingSupported = false;
              addLog('info', '[Clone Notice] Mode 01 batching unsupported, reverting to single PID queries.');
            } else {
              // Parse each PID from batched response
              const tokens = batchResp.split(/\s+/).filter((t) => /^[0-9A-Fa-f]{2,3}$/.test(t));
              const echoIdx = tokens.findIndex((t) => t.toUpperCase() === '41');

              if (echoIdx !== -1) {
                let tokenPos = echoIdx + 1;
                while (tokenPos < tokens.length) {
                  const pidToken = tokens[tokenPos].toUpperCase();
                  const expectedLen = MODE_01_PID_LENGTHS[pidToken] || 1;
                  const matchedCmd = batchSlice.find((c) => c.modePid.slice(2).toUpperCase() === pidToken);

                  if (matchedCmd && tokenPos + expectedLen < tokens.length) {
                    const dataBytes = tokens
                      .slice(tokenPos + 1, tokenPos + 1 + expectedLen)
                      .map((h) => parseInt(h, 16));

                    // Evaluate and publish telemetry point
                    let parsedVal: number | null = null;
                    try {
                      if (matchedCmd.obdbFmt) {
                        const decoded = decodeOBDbSignal(matchedCmd.obdbFmt, dataBytes);
                        parsedVal = isNaN(decoded.value) || !isFinite(decoded.value) ? null : decoded.value;
                      } else {
                        parsedVal = evaluateFormula(matchedCmd.formula, dataBytes);
                      }
                    } catch {
                      parsedVal = null;
                    }

                    if (parsedVal !== null) {
                      publishTelemetry(matchedCmd.id, parsedVal);
                      batchedHandledIds.add(matchedCmd.id);
                    }
                  }
                  tokenPos += 1 + expectedLen;
                }
              }
            }
          } catch {
            batchingSupported = false;
          }
        }

        // 4. Poll remaining individual commands
        for (const cmd of dueCommands) {
          if (cancel || !isPollingRef.current || !service.isConnected()) break;
          if (batchedHandledIds.has(cmd.id)) continue;
          if (unsupportedSignalsRef.current.has(cmd.id)) continue;

          try {
            // Header management (cache active header; only send AT SH when it changes)
            if (cmd.header && cmd.header !== activeHeaderRef.current) {
              await service.sendCommand(`AT SH ${cmd.header}`, 1000);
              activeHeaderRef.current = cmd.header;

              // Optional AT CRA filter for STN adapters
              if (caps?.supportsCRA && !caps.unsupportedCommands.has('AT CRA') && cmd.header.length === 3) {
                const reqNum = parseInt(cmd.header, 16);
                if (!isNaN(reqNum)) {
                  const respNum = (reqNum + 8).toString(16).toUpperCase();
                  try {
                    const craResp = await service.sendCommand(`AT CRA ${respNum}`, 800);
                    if (craResp.includes('?')) {
                      caps.unsupportedCommands.add('AT CRA');
                    }
                  } catch {
                    caps.unsupportedCommands.add('AT CRA');
                  }
                }
              }
            }

            // Construct wire command with single response-count optimization if supported
            let wireCmd = formatWireCommand(cmd.modePid, caps ? caps.supportsResponseCount : true);
            let response = await service.sendCommand(wireCmd, 1500);

            // Clone tolerance: if adapter returned '?', disable response count and retry
            if (response.includes('?') && wireCmd !== cmd.modePid) {
              if (caps) caps.supportsResponseCount = false;
              addLog('info', '[Clone Notice] Trailing response count not supported, using standard format.');
              wireCmd = cmd.modePid;
              response = await service.sendCommand(wireCmd, 1500);
            }

            // Check if vehicle ECU does not support this signal (NO DATA / 7F negative response)
            if (isUnsupportedResponse(response)) {
              unsupportedSignalsRef.current.add(cmd.id);
              setUnsupportedSignals(new Set(unsupportedSignalsRef.current));
              addLog('info', `[ECU] Signal "${cmd.commandName}" (${cmd.modePid}) not supported by vehicle.`);
              continue;
            }

            // Parse response
            const val = parseAndEvaluateResponse(response, cmd.modePid, cmd.formula, cmd.obdbFmt);
            if (val !== null) {
              publishTelemetry(cmd.id, val);
            }
          } catch (err: any) {
            if (err.message && err.message.includes('Timeout')) {
              console.warn(`Polling timeout on ${cmd.commandName}:`, err.message);
            }
          }

          // Small prompt-driven inter-command pause (12ms) for CAN bus arbitration
          await new Promise((r) => setTimeout(r, 12));
        }

        // Small pause before next cycle
        await new Promise((r) => setTimeout(r, 15));
      }
    };

    const publishTelemetry = (cmdId: string, val: number) => {
      const now = Date.now();
      setLiveValues((prev) => {
        const updated = { ...prev, [cmdId]: val };
        widgets.forEach((w) => {
          if (w.signalSourceId && (w.signalSourceId === cmdId || cmdId.endsWith(w.signalSourceId.replace(/^[^_]+_/, '')))) {
            updated[w.signalSourceId] = val;
          }
        });
        return updated;
      });

      setHistoryBuffers((prev) => {
        const existing = prev[cmdId] || [];
        const updated = [...existing, { timestamp: now, value: val }].slice(-MAX_HISTORY_POINTS);
        const result = { ...prev, [cmdId]: updated };
        widgets.forEach((w) => {
          if (w.signalSourceId && (w.signalSourceId === cmdId || cmdId.endsWith(w.signalSourceId.replace(/^[^_]+_/, '')))) {
            result[w.signalSourceId] = updated;
          }
        });
        return result;
      });
    };

    pollLoop();

    return () => {
      cancel = true;
    };
  }, [status, widgets, isDrawerOpen, availableCommands, getActiveService, addLog]);

  return (
    <BLEContext.Provider
      value={{
        status,
        connectionType,
        deviceName,
        isSimulated,
        setIsSimulated,
        isBLESupported,
        isSerialSupported,
        atLogs,
        liveValues,
        historyBuffers,
        isDrawerOpen,
        setIsDrawerOpen,
        batteryGuardActive,
        batteryVoltage12V,
        unsupportedSignals,
        connect,
        connectBLE,
        connectClassic,
        connectUSB,
        connectSerial,
        forgetSavedDevices,
        disconnect,
        quickReconnect,
        sendManualCommand,
        clearLogs,
      }}
    >
      {children}
    </BLEContext.Provider>
  );
};

export function useBLE(): BLEContextType {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error('useBLE must be used within a BLEProvider');
  }
  return context;
}
