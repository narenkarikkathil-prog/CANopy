import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { BLEConnectionStatus, ATLogEntry, ConnectionType, DataRateBenchmark } from '../types/ble';
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
import { findCommandForWidget } from '../services/widgetResolver';
import { VEHICLE_DEFINITIONS } from '../data/defaultVehicles';
import {
  type TelemetrySample,
  generateTelemetryCSV,
  downloadCSV,
} from '../services/telemetryRecorder';

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

  // Data Collection Rate (requests per second)
  pollingRateHz: number;
  setPollingRateHz: (rate: number, isUserExplicit?: boolean) => void;
  actualRateHz: number;
  rateRationale: string;
  isCustomRate: boolean;
  benchmarkAdapterSpeed: () => Promise<DataRateBenchmark | null>;
  resetToScientificDefault: () => void;
  lastBenchmark: DataRateBenchmark | null;

  // Telemetry Recording & CSV Export
  isRecording: boolean;
  recordingDuration: number;
  recordedSamplesCount: number;
  recordedChannelsCount: number;
  startRecording: () => void;
  stopRecording: () => void;
  deleteRecording: () => void;
  startNewRecording: () => void;
  exportRecordingCSV: () => void;
}

/**
 * Computes the scientifically grounded default polling rate (requests per second)
 * based on physical bus constraints and adapter hardware:
 * 1. Legacy protocols (J1850 / ISO 9141 / KWP @ 10.4-41.6 kbps): 4 req/s max
 * 2. STN chipsets (STN11xx, STN21xx, OBDLink, vLinker with 32-bit core & deep FIFOs): 20 req/s
 * 3. ELM327 with verified Adaptive Timing 2 (AT2) on 500 kbps CAN: 12 req/s
 * 4. Standard ELM327 BLE on CAN: 10 req/s (certified to avoid BLE GATT notification drop)
 */
export function computeScientificDefaultRate(
  caps: AdapterCapabilities | null,
  _connectionType?: ConnectionType,
  isSimulated?: boolean
): { rate: number; rationale: string } {
  if (isSimulated) {
    return {
      rate: 10,
      rationale: 'Simulated adapter running at standard 10 req/s baseline.',
    };
  }

  if (!caps) {
    return {
      rate: 10,
      rationale: 'Recommended 10 req/s default for ISO 15765-4 CAN (500 kbps).',
    };
  }

  if (/^[1-5]$/.test(caps.protocol)) {
    return {
      rate: 4,
      rationale: `Protocol ${caps.protocol} (legacy non-CAN at 10.4–41.6 kbps). Capped at 4 req/s to prevent bus collision.`,
    };
  }

  if (caps.isSTN) {
    return {
      rate: 20,
      rationale: `${caps.identity || 'STN / OBDLink'} 32-bit processor detected. Certified for 20 req/s without packet drops.`,
    };
  }

  if (caps.supportsAT2) {
    return {
      rate: 12,
      rationale: 'ELM327 with Adaptive Timing 2 (AT2) on 500 kbps CAN bus. Optimal throughput: 12 req/s.',
    };
  }

  return {
    rate: 10,
    rationale: 'Standard ELM327 BLE on CAN bus. 10 req/s recommended to prevent BLE buffer drops.',
  };
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
/**
 * Formats a clean standard OBD wire command without trailing digits.
 * ELM327 / STN Adaptive Timing cuts off response automatically upon receiving prompt '>'.
 */
function formatWireCommand(modePid: string): string {
  return modePid.replace(/\s+/g, '').toUpperCase();
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

  // Telemetry Recording State & Refs
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [recordedSamplesCount, setRecordedSamplesCount] = useState<number>(0);
  const [recordedChannelsCount, setRecordedChannelsCount] = useState<number>(0);

  // Data Collection Rate State & Refs
  const [pollingRateHz, setPollingRateHzState] = useState<number>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('canopy_polling_rate_hz');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 1 && val <= 40) return val;
      }
    }
    return 10;
  });

  const [isCustomRate, setIsCustomRate] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('canopy_polling_rate_hz') !== null;
    }
    return false;
  });

  const [rateRationale, setRateRationale] = useState<string>(
    'Recommended 10 req/s default for modern ISO 15765-4 CAN vehicles.'
  );

  const [lastBenchmark, setLastBenchmark] = useState<DataRateBenchmark | null>(null);
  const [actualRateHz, setActualRateHz] = useState<number>(0);

  const pollingRateHzRef = useRef<number>(pollingRateHz);
  pollingRateHzRef.current = pollingRateHz;
  const isCustomRateRef = useRef<boolean>(isCustomRate);
  isCustomRateRef.current = isCustomRate;
  const requestTimestampsRef = useRef<number[]>([]);

  const isRecordingRef = useRef<boolean>(false);
  const recordedSamplesRef = useRef<TelemetrySample[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const currentSnapshotRef = useRef<Record<string, number>>({});
  const recordingTimerRef = useRef<any>(null);

  const bleServiceRef = useRef<BLEService | null>(null);
  const serialServiceRef = useRef<SerialOBDService | null>(null);
  const mockServiceRef = useRef<MockBLEService | null>(null);
  const capabilitiesRef = useRef<AdapterCapabilities | null>(null);

  const isPollingRef = useRef<boolean>(false);
  const activeHeaderRef = useRef<string | null>(null);
  const pollRunRef = useRef<number>(0);
  const availableCommandsRef = useRef(availableCommands);
  availableCommandsRef.current = availableCommands;
  const unsupportedSignalsRef = useRef<Set<string>>(new Set());
  const failedSignalCountsRef = useRef<Map<string, number>>(new Map());

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

  const applyScientificRateRecommendation = useCallback(
    (caps: AdapterCapabilities | null, connType?: ConnectionType, simulated?: boolean) => {
      const recommendation = computeScientificDefaultRate(caps, connType, simulated);
      setRateRationale(recommendation.rationale);
      if (!isCustomRateRef.current) {
        setPollingRateHzState(recommendation.rate);
        pollingRateHzRef.current = recommendation.rate;
        addLog('info', `[Data Rate] Configured collection rate to ${recommendation.rate} req/s (${recommendation.rationale})`);
      }
    },
    [addLog]
  );

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
      },
      (name, caps) => {
        capabilitiesRef.current = caps;
        setStatus('connected');
        setDeviceName(name);
        applyScientificRateRecommendation(caps, 'classic', false);
        addLog('info', `[Auto-Reconnect] Connected to ${name}. Telemetry polling active.`);
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
      serialServiceRef.current?.destroy();
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

  const setPollingRateHz = useCallback((newRate: number, isUserExplicit = true) => {
    const clamped = Math.max(1, Math.min(40, Math.round(newRate)));
    setPollingRateHzState(clamped);
    pollingRateHzRef.current = clamped;
    if (isUserExplicit) {
      setIsCustomRate(true);
      isCustomRateRef.current = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('canopy_polling_rate_hz', clamped.toString());
      }
    }
  }, []);

  const resetToScientificDefault = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('canopy_polling_rate_hz');
    }
    setIsCustomRate(false);
    isCustomRateRef.current = false;
    const rec = computeScientificDefaultRate(capabilitiesRef.current, connectionType, isSimulated);
    setPollingRateHzState(rec.rate);
    pollingRateHzRef.current = rec.rate;
    setRateRationale(rec.rationale);
    addLog('info', `[Data Rate] Reset to scientific default: ${rec.rate} req/s.`);
  }, [connectionType, isSimulated, addLog]);

  const benchmarkAdapterSpeed = useCallback(async (): Promise<DataRateBenchmark | null> => {
    const service = getActiveService();
    if (!service || !service.isConnected()) {
      addLog('error', '[Benchmark] Cannot benchmark: OBD adapter is not connected.');
      return null;
    }

    addLog('info', '[Benchmark] Measuring round-trip adapter exchange rate (3 probe samples)...');
    try {
      const probeLatencies: number[] = [];
      const probeCmd = 'AT RV';

      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await service.sendCommand(probeCmd, 1200);
        const duration = performance.now() - start;
        probeLatencies.push(duration);
        await new Promise((r) => setTimeout(r, 15));
      }

      const avgLatencyMs = Math.round(
        probeLatencies.reduce((sum, d) => sum + d, 0) / probeLatencies.length
      );

      const rawMaxRate = avgLatencyMs > 0 ? Math.floor(1000 / avgLatencyMs) : 10;
      const maxRateHz = Math.min(40, Math.max(1, rawMaxRate));
      const recommendedRateHz = Math.max(2, Math.min(30, Math.floor(maxRateHz * 0.75)));

      const benchmarkResult: DataRateBenchmark = {
        latencyMs: avgLatencyMs,
        maxRateHz,
        recommendedRateHz,
        testedAt: Date.now(),
      };

      setLastBenchmark(benchmarkResult);
      setRateRationale(
        `Benchmarked hardware round-trip: ${avgLatencyMs}ms (Max ~${maxRateHz} req/s). Safe recommended rate: ${recommendedRateHz} req/s.`
      );
      addLog(
        'info',
        `[Benchmark Complete] Average Latency: ${avgLatencyMs}ms | Hardware Max: ${maxRateHz} req/s | Safe Target: ${recommendedRateHz} req/s`
      );

      if (!isCustomRateRef.current) {
        setPollingRateHzState(recommendedRateHz);
        pollingRateHzRef.current = recommendedRateHz;
      }

      return benchmarkResult;
    } catch (err: any) {
      addLog('error', `[Benchmark Failed] ${err.message || 'Error measuring exchange rate'}`);
      return null;
    }
  }, [getActiveService, addLog]);

  // Monitor live actual requests per second
  useEffect(() => {
    const rateInterval = setInterval(() => {
      if (status !== 'connected') {
        setActualRateHz(0);
        return;
      }
      const now = Date.now();
      const count = requestTimestampsRef.current.filter((t) => t >= now - 1000).length;
      setActualRateHz(count);
    }, 500);

    return () => clearInterval(rateInterval);
  }, [status]);

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
        const profileProto =
          activeVehicle?.protocol ||
          VEHICLE_DEFINITIONS.find((v) => v.name === activeVehicle?.name)?.protocol ||
          '6';

        // Clear any previous session unsupported signals, resetting all widgets fresh
        unsupportedSignalsRef.current.clear();
        setUnsupportedSignals(new Set());
        setLiveValues({});
        setHistoryBuffers({});
        activeHeaderRef.current = null;
        pollRunRef.current++;
        setBatteryGuardActive(false);
        setBatteryVoltage12V(null);

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
          applyScientificRateRecommendation(caps, targetMode, isSimulated);
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
        if (isSerialKind) {
          try {
            await serialServiceRef.current?.disconnect();
          } catch {}
        }
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
    unsupportedSignalsRef.current.clear();
    setUnsupportedSignals(new Set());
    setLiveValues({});
    setBatteryGuardActive(false);
    setBatteryVoltage12V(null);
  }, []);

  const quickReconnect = useCallback(async () => {
    addLog('info', 'Quick-reconnect triggered: restarting initialization sequence...');
    setStatus('connecting');
    const service = getActiveService();
    if (!service) return;

    try {
      const profileProto =
        activeVehicle?.protocol ||
        VEHICLE_DEFINITIONS.find((v) => v.name === activeVehicle?.name)?.protocol ||
        '6';

      // Clear unsupported blacklist and reset widget live telemetry buffers fresh
      unsupportedSignalsRef.current.clear();
      setUnsupportedSignals(new Set());
      setLiveValues({});
      setHistoryBuffers({});
      activeHeaderRef.current = null;
      pollRunRef.current++;
      setBatteryGuardActive(false);
      setBatteryVoltage12V(null);

      let caps: AdapterCapabilities | null = null;
      if (service instanceof SerialOBDService) {
        caps = await service.reconnect(profileProto);
      } else if (!service.isConnected()) {
        await (service as any).connect(profileProto);
        caps = (service as any).getCapabilities ? (service as any).getCapabilities() : null;
      } else {
        caps = await (service as any).runInitSequence(profileProto);
      }
      if (caps) {
        capabilitiesRef.current = caps;
        applyScientificRateRecommendation(caps, connectionType, isSimulated);
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

    // Reset blacklists and failure counts on fresh polling run
    unsupportedSignalsRef.current.clear();
    failedSignalCountsRef.current.clear();

    // Collect PIDs to poll:
    // 1. Attached to active widgets
    // 2. Custom commands if drawer is open
    const activeCommandIds = new Set<string>();

    widgets.forEach((w, idx) => {
      const cmd = findCommandForWidget(w, availableCommands, idx);
      if (cmd) {
        activeCommandIds.add(cmd.id);
      }
    });

    if (isDrawerOpen) {
      availableCommands
        .filter((c) => c.isCustom)
        .forEach((c) => activeCommandIds.add(c.id));
    }

    let commandsToPoll = availableCommands.filter((c) => activeCommandIds.has(c.id));

    // If no widgets matched or commands are empty, fall back to standard core PIDs
    // so adapter polling is active, LEDs blink, and live data requests flow!
    if (commandsToPoll.length === 0) {
      const starterPids = ['010C', '010D', '0105'];
      const starterCmds = availableCommands.filter((c) => starterPids.includes(c.modePid));
      commandsToPoll = starterCmds.length > 0 ? starterCmds : availableCommands.slice(0, 3);
    }

    if (commandsToPoll.length === 0) {
      return;
    }

    const pollLoop = async () => {
      const runId = ++pollRunRef.current;
      activeHeaderRef.current = null;
      const service = getActiveService();
      let loopCounter = 0;
      let batchingSupported = true;
      let consecutiveTimeouts = 0;

      while (!cancel && runId === pollRunRef.current && isPollingRef.current && service?.isConnected()) {
        loopCounter++;

        // 1. Battery Guard: Check 12V voltage every 30 cycles
        if (loopCounter % 30 === 1) {
          try {
            const rvResp = await service.sendCommand('AT RV', 1200);
            if (cancel || runId !== pollRunRef.current) break;
            const voltsMatch = rvResp.match(/([0-9.]+)\s*V/i);
            if (voltsMatch) {
              const volts = parseFloat(voltsMatch[1]);
              if (!isNaN(volts) && volts > 0) {
                setBatteryVoltage12V(volts);

                // Critical 12V guard (< 10.5V indicates extreme battery drainage)
                if (volts < 10.5) {
                  setBatteryGuardActive(true);
                  addLog('info', `[Battery Guard] 12V battery is low (${volts}V). Pausing briefly.`);
                  loopCounter = 0;
                  await new Promise((r) => setTimeout(r, 3000));
                  if (cancel || runId !== pollRunRef.current) break;
                  continue;
                } else {
                  setBatteryGuardActive(false);
                }
              } else {
                setBatteryVoltage12V(null);
              }
            }
          } catch {
            // continue
          }
        }

        // 2. Tiered selection: Fast signals every cycle; slow signals every 3rd cycle
        let dueCommands = commandsToPoll.filter((cmd) => {
          if (unsupportedSignalsRef.current.has(cmd.id)) return false;
          if (isFastSignal(cmd)) return true;
          return loopCounter % 3 === 0;
        });

        // Fail-safe: Ensure polling never enters an idle stall
        if (dueCommands.length === 0) {
          // If all signals were blacklisted, clear blacklist and retry
          if (unsupportedSignalsRef.current.size >= commandsToPoll.length && commandsToPoll.length > 0) {
            unsupportedSignalsRef.current.clear();
            setUnsupportedSignals(new Set());
            failedSignalCountsRef.current.clear();
          }
          // Fall back to all active commands so live requests and adapter LEDs never go silent
          dueCommands = commandsToPoll.filter((cmd) => !unsupportedSignalsRef.current.has(cmd.id));
          if (dueCommands.length === 0) {
            dueCommands = commandsToPoll;
          }
        }

        // 3. Check for standard Mode 01 multi-PID batching (up to 6 PIDs per query)
        const mode01Candidates = dueCommands.filter(
          (c) => /^01[0-9A-Fa-f]{2}$/i.test(c.modePid) && (!c.header || c.header === '7E0')
        );

        const batchedHandledIds = new Set<string>();

        if (batchingSupported && mode01Candidates.length >= 2) {
          const batchSlice = mode01Candidates.slice(0, 6);
          const pidsOnly = batchSlice.map((c) => c.modePid.slice(2).toUpperCase());
          const batchedWireCmd = `01 ${pidsOnly.join(' ')}`;

          try {
            // Ensure header is standard 7E0 (no manual AT CRA; automatic receive handles responses)
            if (activeHeaderRef.current !== '7E0') {
              await service.sendCommand('AT SH 7E0', 1000);
              if (cancel || runId !== pollRunRef.current) break;
              activeHeaderRef.current = '7E0';
            }

            const batchStart = performance.now();
            const batchResp = await service.sendCommand(batchedWireCmd, 1500);
            const batchDuration = performance.now() - batchStart;
            if (cancel || runId !== pollRunRef.current) break;
            consecutiveTimeouts = 0;

            const nowBatchTs = Date.now();
            for (let b = 0; b < batchSlice.length; b++) {
              requestTimestampsRef.current.push(nowBatchTs);
            }
            const batchCutoff = nowBatchTs - 1500;
            requestTimestampsRef.current = requestTimestampsRef.current.filter((t) => t >= batchCutoff);

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
                      failedSignalCountsRef.current.set(matchedCmd.id, 0);
                      publishTelemetry(matchedCmd.id, parsedVal);
                      batchedHandledIds.add(matchedCmd.id);
                    }
                  }
                  tokenPos += 1 + expectedLen;
                }
              }
            }

            const targetBatchIntervalMs = (1000 / Math.max(1, Math.min(40, pollingRateHzRef.current))) * Math.min(2.5, batchSlice.length);
            const batchDelay = Math.max(8, Math.round(targetBatchIntervalMs - batchDuration));
            await new Promise((r) => setTimeout(r, batchDelay));
          } catch (batchErr: any) {
            batchingSupported = false;
            if (batchErr.message && batchErr.message.includes('Timeout')) {
              consecutiveTimeouts++;
              if (consecutiveTimeouts >= 3) {
                addLog('info', '[Polling] 3 consecutive timeouts. Running re-sync (\\r)...');
                try {
                  await service.sendCommand('\r', 1000);
                  consecutiveTimeouts = 0;
                  addLog('info', '[Polling] Re-sync successful.');
                } catch {
                  addLog('error', '[Polling] Re-sync failed after 3 timeouts. Connection lost.');
                  if (typeof (service as any).handleLost === 'function') {
                    await (service as any).handleLost('3 consecutive command timeouts and re-sync failed');
                  } else {
                    disconnect();
                  }
                  break;
                }
              }
            }
          }
        }

        // 4. Poll remaining individual commands
        for (const cmd of dueCommands) {
          if (cancel || runId !== pollRunRef.current || !isPollingRef.current || !service.isConnected()) break;
          if (batchedHandledIds.has(cmd.id)) continue;
          if (unsupportedSignalsRef.current.has(cmd.id)) continue;

          let cmdDuration = 0;
          try {
            // Header management (cache active header; only send AT SH when it changes)
            const targetHeader = cmd.header || '7E0';
            if (targetHeader !== activeHeaderRef.current) {
              await service.sendCommand(`AT SH ${targetHeader}`, 1000);
              if (cancel || runId !== pollRunRef.current) break;
              activeHeaderRef.current = targetHeader;
            }

            // Standard clean wire command
            const wireCmd = formatWireCommand(cmd.modePid);
            const cmdStart = performance.now();
            const response = await service.sendCommand(wireCmd, 1500);
            cmdDuration = performance.now() - cmdStart;
            if (cancel || runId !== pollRunRef.current) break;

            const nowCmdTs = Date.now();
            requestTimestampsRef.current.push(nowCmdTs);
            const cmdCutoff = nowCmdTs - 1500;
            requestTimestampsRef.current = requestTimestampsRef.current.filter((t) => t >= cmdCutoff);

            // Reset consecutive timeouts on success
            consecutiveTimeouts = 0;

            // Check if vehicle ECU does not support this signal
            if (isUnsupportedResponse(response)) {
              const isExplicitNrc = /7F\s+[0-9A-Fa-f]{2}\s+(11|12|31)/i.test(response);
              const failCount = (failedSignalCountsRef.current.get(cmd.id) || 0) + 1;
              failedSignalCountsRef.current.set(cmd.id, failCount);

              // Only permanently blacklist after 5 consecutive failures or explicit UDS NRC
              if (isExplicitNrc || failCount >= 5) {
                unsupportedSignalsRef.current.add(cmd.id);
                setUnsupportedSignals(new Set(unsupportedSignalsRef.current));
                addLog('info', `[ECU] Signal "${cmd.commandName}" (${cmd.modePid}) not supported by vehicle.`);
              }
              continue;
            }

            // Parse response
            const val = parseAndEvaluateResponse(response, cmd.modePid, cmd.formula, cmd.obdbFmt);
            if (val !== null) {
              failedSignalCountsRef.current.set(cmd.id, 0);
              publishTelemetry(cmd.id, val);
            }
          } catch (err: any) {
            if (err.message && err.message.includes('Timeout')) {
              consecutiveTimeouts++;
              console.warn(`Polling timeout on ${cmd.commandName} (${consecutiveTimeouts}/3):`, err.message);
              if (consecutiveTimeouts >= 3) {
                addLog('info', '[Polling] 3 consecutive timeouts. Running re-sync (\\r)...');
                try {
                  await service.sendCommand('\r', 1000);
                  consecutiveTimeouts = 0;
                  addLog('info', '[Polling] Re-sync successful.');
                } catch {
                  addLog('error', '[Polling] Re-sync failed after 3 timeouts. Connection lost.');
                  if (typeof (service as any).handleLost === 'function') {
                    await (service as any).handleLost('3 consecutive command timeouts and re-sync failed');
                  } else {
                    disconnect();
                  }
                  break;
                }
              }
            }
          }

          // Dynamic delay between commands based on target collection rate (requests/sec)
          const targetIntervalMs = 1000 / Math.max(1, Math.min(40, pollingRateHzRef.current));
          const delayNeeded = Math.max(8, Math.round(targetIntervalMs - cmdDuration));
          await new Promise((r) => setTimeout(r, delayNeeded));
          if (cancel || runId !== pollRunRef.current) break;
        }

        // Small inter-cycle safety delay
        const cycleDelay = Math.max(10, Math.round(1000 / Math.max(1, pollingRateHzRef.current) / 2));
        await new Promise((r) => setTimeout(r, cycleDelay));
        if (cancel || runId !== pollRunRef.current) break;
      }
    };

    const publishTelemetry = (cmdId: string, val: number) => {
      const now = Date.now();
      currentSnapshotRef.current[cmdId] = val;

      if (isRecordingRef.current) {
        if (!recordingStartTimeRef.current) {
          recordingStartTimeRef.current = now;
        }
        const cmd = availableCommandsRef.current.find((c) => c.id === cmdId);
        const sample: TelemetrySample = {
          timestamp: now,
          isoTime: new Date(now).toISOString(),
          elapsedSeconds: (now - recordingStartTimeRef.current) / 1000,
          cmdId,
          commandName: cmd?.commandName || cmdId,
          modePid: cmd?.modePid || '',
          units: cmd?.units || '',
          value: val,
          snapshot: { ...currentSnapshotRef.current },
        };
        recordedSamplesRef.current.push(sample);
      }

      setLiveValues((prev) => {
        const updated = { ...prev, [cmdId]: val };
        widgets.forEach((w, idx) => {
          const matched = findCommandForWidget(w, availableCommands, idx);
          if (matched && matched.id === cmdId) {
            if (w.signalSourceId) updated[w.signalSourceId] = val;
            updated[w.id] = val;
          }
        });
        return updated;
      });

      setHistoryBuffers((prev) => {
        const existing = prev[cmdId] || [];
        const updated = [...existing, { timestamp: now, value: val }].slice(-MAX_HISTORY_POINTS);
        const result = { ...prev, [cmdId]: updated };
        widgets.forEach((w, idx) => {
          const matched = findCommandForWidget(w, availableCommands, idx);
          if (matched && matched.id === cmdId) {
            if (w.signalSourceId) result[w.signalSourceId] = updated;
            result[w.id] = updated;
          }
        });
        return result;
      });
    };

    pollLoop();

    return () => {
      cancel = true;
    };
  }, [status, widgets, isDrawerOpen, availableCommands, getActiveService, addLog, disconnect]);

  // Telemetry Recording Controls
  const startRecording = useCallback(() => {
    isRecordingRef.current = true;
    setIsRecording(true);

    if (recordingStartTimeRef.current === null) {
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);
    }

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    recordingTimerRef.current = setInterval(() => {
      if (recordingStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
        setRecordedSamplesCount(recordedSamplesRef.current.length);
        const uniqueChannels = new Set(recordedSamplesRef.current.map((s) => s.cmdId)).size;
        setRecordedChannelsCount(uniqueChannels);
      }
    }, 1000);

    addLog('info', '[Logger] Telemetry recording started.');
  }, [addLog]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recordingStartTimeRef.current) {
      const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
      setRecordingDuration(elapsed);
    }
    setRecordedSamplesCount(recordedSamplesRef.current.length);
    const uniqueChannels = new Set(recordedSamplesRef.current.map((s) => s.cmdId)).size;
    setRecordedChannelsCount(uniqueChannels);

    addLog('info', `[Logger] Telemetry recording stopped (${recordedSamplesRef.current.length} samples collected).`);
  }, [addLog]);

  const deleteRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    recordedSamplesRef.current = [];
    recordingStartTimeRef.current = null;
    currentSnapshotRef.current = {};
    setRecordingDuration(0);
    setRecordedSamplesCount(0);
    setRecordedChannelsCount(0);

    addLog('info', '[Logger] Telemetry recording deleted.');
  }, [addLog]);

  const startNewRecording = useCallback(() => {
    deleteRecording();
    setTimeout(() => {
      startRecording();
    }, 50);
  }, [deleteRecording, startRecording]);

  const exportRecordingCSV = useCallback(() => {
    const samples = recordedSamplesRef.current;
    if (samples.length === 0) {
      addLog('info', '[Logger] Cannot export: no telemetry samples recorded.');
      return;
    }

    const csvContent = generateTelemetryCSV(samples, availableCommandsRef.current);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const vName = (activeVehicle?.name || 'Vehicle').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `canopy_telemetry_${vName}_${dateStr}.csv`;

    downloadCSV(csvContent, fileName);
    addLog('info', `[Logger] Exported ${samples.length} telemetry samples to ${fileName}.`);
  }, [activeVehicle, addLog]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

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

        // Data Collection Rate
        pollingRateHz,
        setPollingRateHz,
        actualRateHz,
        rateRationale,
        isCustomRate,
        benchmarkAdapterSpeed,
        resetToScientificDefault,
        lastBenchmark,

        // Telemetry Recording
        isRecording,
        recordingDuration,
        recordedSamplesCount,
        recordedChannelsCount,
        startRecording,
        stopRecording,
        deleteRecording,
        startNewRecording,
        exportRecordingCSV,
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
