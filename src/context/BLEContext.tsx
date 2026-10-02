import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { BLEConnectionStatus, ATLogEntry, ConnectionType } from '../types/ble';
import type { LiveTelemetryMap, HistoryBufferMap } from '../types/telemetry';
import { BLEService } from '../services/bleService';
import { SerialOBDService } from '../services/serialService';
import { MockBLEService } from '../services/mockBleService';
import { useVehicle } from './VehicleContext';
import { useWidgets } from './WidgetContext';
import { parseAndEvaluateResponse, isUnsupportedResponse } from '../services/obdParser';
import { validateCommandSafety } from '../services/obdbParser';

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
  connect: (mode?: ConnectionType) => Promise<void>;
  connectBLE: () => Promise<void>;
  connectClassic: () => Promise<void>;
  connectUSB: () => Promise<void>;
  connectSerial: (subMode?: 'classic' | 'usb') => Promise<void>;
  disconnect: () => void;
  quickReconnect: () => Promise<void>;
  sendManualCommand: (cmd: string) => Promise<string>;
  clearLogs: () => void;
}

const BLEContext = createContext<BLEContextType | null>(null);

const MAX_HISTORY_POINTS = 120; // 60-120 seconds rolling window

export const BLEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { availableCommands } = useVehicle();
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
    setAtLogs((prev) => [...prev.slice(-300), entry]); // Keep last 300 logs
  }, []);

  const clearLogs = useCallback(() => {
    setAtLogs([]);
  }, []);

  // Initialize service instances
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

  // Keep mock service command provider updated
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
    async (mode?: ConnectionType) => {
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
        if (isSerialKind && serialServiceRef.current) {
          const subMode = targetMode === 'classic' ? 'classic' : targetMode === 'usb' ? 'usb' : 'all';
          await serialServiceRef.current.connect(subMode);
        } else {
          await service.connect();
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
    [connectionType, isSimulated, addLog]
  );

  const connectBLE = useCallback(() => connect('ble'), [connect]);
  const connectClassic = useCallback(() => connect('classic'), [connect]);
  const connectUSB = useCallback(() => connect('usb'), [connect]);
  const connectSerial = useCallback((subMode?: 'classic' | 'usb') => connect(subMode || 'serial'), [connect]);

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
      if (!service.isConnected()) {
        await service.connect();
      } else {
        await service.runInitSequence();
      }
      setStatus('connected');
      setDeviceName(service.getDeviceName() || null);
    } catch (err: any) {
      setStatus('disconnected');
      setDeviceName(null);
      addLog('error', `Quick-reconnect failed: ${err.message}`);
    }
  }, [getActiveService, addLog]);

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

      // Hard safety allowlist check
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

  // Polling Scheduler Loop
  // Step 4: Gentle staggered polling, battery guard, and unsupported signal handling
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
        // Direct match
        const directCmd = availableCommands.find((c) => c.id === w.signalSourceId);
        if (directCmd) {
          activeCommandIds.add(directCmd.id);
        } else {
          // Suffix match (e.g. user selected vehicle changed)
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
      let cmdIndex = 0;

      while (!cancel && isPollingRef.current && service?.isConnected()) {
        loopCounter++;

        // Step 4: Battery Guard — check 12V battery voltage every 15 cycles
        if (loopCounter % 15 === 1) {
          try {
            const rvResp = await service.sendCommand('AT RV', 1500);
            const voltsMatch = rvResp.match(/([0-9.]+)\s*V/i);
            if (voltsMatch) {
              const volts = parseFloat(voltsMatch[1]);
              setBatteryVoltage12V(volts);

              // Low 12V voltage guard (< 11.8V indicates weak battery or vehicle turned OFF)
              if (volts > 0 && volts < 11.8) {
                setBatteryGuardActive(true);
                addLog('info', `[Battery Guard] 12V battery is low (${volts}V). Pausing polling to avoid battery drain.`);
                // Pause for 10 seconds before re-checking
                await new Promise((r) => setTimeout(r, 10000));
                continue;
              } else {
                setBatteryGuardActive(false);
              }
            }
          } catch {
            // AT RV check failed, continue
          }
        }

        const cmd = commandsToPoll[cmdIndex % commandsToPoll.length];
        cmdIndex++;

        // Step 4: Gracefully skip signals known to be unsupported by this vehicle
        if (unsupportedSignalsRef.current.has(cmd.id)) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }

        try {
          // Switch header if necessary (e.g. 7E4 for battery vs 7E0 standard)
          if (cmd.header && cmd.header !== activeHeaderRef.current) {
            await service.sendCommand(`AT SH ${cmd.header}`, 1500);
            activeHeaderRef.current = cmd.header;
          }

          // Send PID (staggered with 2000ms timeout)
          const response = await service.sendCommand(cmd.modePid, 2000);

          // Step 4: Check if vehicle does not support this signal (NO DATA / 7F negative response)
          if (isUnsupportedResponse(response)) {
            unsupportedSignalsRef.current.add(cmd.id);
            setUnsupportedSignals(new Set(unsupportedSignalsRef.current));
            addLog('info', `[ECU] Signal "${cmd.commandName}" (${cmd.modePid}) not supported by vehicle. Disabled retry.`);
            continue;
          }

          // Parse and evaluate response
          const val = parseAndEvaluateResponse(response, cmd.modePid, cmd.formula, cmd.obdbFmt);

          if (val !== null) {
            const now = Date.now();
            setLiveValues((prev) => {
              const updated = { ...prev, [cmd.id]: val };
              // Also map to any widget that points to this signal or suffix
              widgets.forEach((w) => {
                if (w.signalSourceId && (w.signalSourceId === cmd.id || cmd.id.endsWith(w.signalSourceId.replace(/^[^_]+_/, '')))) {
                  updated[w.signalSourceId] = val;
                }
              });
              return updated;
            });

            setHistoryBuffers((prev) => {
              const existing = prev[cmd.id] || [];
              const updated = [...existing, { timestamp: now, value: val }].slice(-MAX_HISTORY_POINTS);
              const result = { ...prev, [cmd.id]: updated };
              widgets.forEach((w) => {
                if (w.signalSourceId && (w.signalSourceId === cmd.id || cmd.id.endsWith(w.signalSourceId.replace(/^[^_]+_/, '')))) {
                  result[w.signalSourceId] = updated;
                }
              });
              return result;
            });
          }
        } catch (err: any) {
          if (err.message && err.message.includes('Timeout')) {
            console.warn(`Polling timeout on ${cmd.commandName}:`, err.message);
          }
        }

        // Step 4: Poll gently — 100ms inter-command stagger for CAN arbitration
        await new Promise((r) => setTimeout(r, 100));
      }
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
