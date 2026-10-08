/**
 * adapterInit.ts
 * Fast, robust, adapter-agnostic initialization for ELM327 and STN adapters.
 * Shared between Web Serial (Bluetooth Classic / USB) and Web Bluetooth (BLE).
 */

export interface OBDTransport {
  send(cmd: string, timeoutMs?: number): Promise<string>;
  log(direction: 'tx' | 'rx' | 'info' | 'error', text: string): void;
  flush(): void;
  isConnected(): boolean;
}

export interface AdapterCapabilities {
  identity: string;
  deviceDescription?: string;
  isSTN: boolean;
  protocol: string;
  supportsAT2: boolean;
  supportsCRA: boolean;
  supportsResponseCount: boolean;
  supportsL0: boolean;
  supportsS0: boolean;
  unsupportedCommands: Set<string>;
  stageTimings: Record<string, number>;
  totalInitTimeMs: number;
}

/**
 * Executes the fast, robust initialization sequence.
 *
 * Sequence:
 * 1. 150ms stabilization delay after port/GATT opens, then flush input.
 * 2. Sync: Bare \r with 400ms timeout, up to 4 retries. Stray '?' is treated as alive.
 * 3. Reset: AT WS first (1500ms timeout). Falls back to AT Z (3000ms) + re-sync if AT WS fails.
 * 4. Standard Config: AT E0, AT L0, AT S0, AT H1 awaiting prompt '>'.
 * 5. Protocol: Active profile protocol (e.g. AT SP 6), or AT SP 0 + 0100 + AT DPN lock-in.
 * 6. Capability Probe: ATI, AT@1, STI, AT AT2 (all best-effort).
 */
export async function executeAdapterInit(
  transport: OBDTransport,
  profileProtocol?: string
): Promise<AdapterCapabilities> {
  const tTotalStart = performance.now();
  const stageTimings: Record<string, number> = {};
  const unsupported = new Set<string>();

  // -------------------------------------------------------------
  // 1. Connection Stabilization & Flush
  // -------------------------------------------------------------
  const tStabStart = performance.now();
  await new Promise((r) => setTimeout(r, 150));
  transport.flush();
  stageTimings['stabilization'] = Math.round(performance.now() - tStabStart);

  // -------------------------------------------------------------
  // 2. Fast Sync: Bare \r with 400ms timeout & up to 4 retries
  // -------------------------------------------------------------
  const tSyncStart = performance.now();
  let synced = false;
  let syncAttempts = 0;

  for (let i = 1; i <= 4; i++) {
    syncAttempts = i;
    try {
      transport.log('tx', '\\r');
      const resp = await transport.send('\r', 400);
      transport.log('rx', resp || '>');
      // Any response or prompt confirms the UART/BLE link is alive
      synced = true;
      break;
    } catch {
      // Retry sync pulse
      transport.flush();
    }
  }

  // If initial sync attempts failed, try a double \r wake pulse before giving up
  if (!synced) {
    transport.log('info', 'Sync attempts unacknowledged. Sending wake pulse (\\r\\r)...');
    try {
      transport.log('tx', '\\r\\r');
      const resp = await transport.send('\r\r', 500);
      transport.log('rx', resp || '>');
      synced = true;
    } catch (e: any) {
      transport.log('error', `Sync failed: ${e.message}`);
      throw new Error(`Adapter failed to respond to sync probe: ${e.message}`);
    }
  }

  stageTimings['sync'] = Math.round(performance.now() - tSyncStart);
  transport.log('info', `[Sync] Adapter responsive in ${stageTimings['sync']}ms (attempt ${syncAttempts})`);

  // -------------------------------------------------------------
  // 3. Reset: AT WS first (Warm Start), fallback to AT Z
  // -------------------------------------------------------------
  const tResetStart = performance.now();

  try {
    transport.log('tx', 'AT WS');
    const wsResp = await transport.send('AT WS', 1500);
    transport.log('rx', wsResp);
  } catch (wsErr: any) {
    transport.log('info', `AT WS unacknowledged (${wsErr.message}). Falling back to AT Z...`);
    try {
      transport.log('tx', 'AT Z');
      const zResp = await transport.send('AT Z', 3000);
      transport.log('rx', zResp);

      // AT Z reboots the controller; allow 400ms and re-sync
      await new Promise((r) => setTimeout(r, 400));
      transport.flush();
      try {
        await transport.send('\r', 400);
      } catch {
        // ignore
      }
    } catch (zErr: any) {
      transport.log('error', `Reset failed: ${zErr.message}`);
      throw new Error(`Adapter reset failed: ${zErr.message}`);
    }
  }

  stageTimings['reset'] = Math.round(performance.now() - tResetStart);

  // -------------------------------------------------------------
  // 4. Standard ELM Configuration: AT E0, AT L0, AT S0, AT H1
  // -------------------------------------------------------------
  const tConfigStart = performance.now();

  // AT E0: Echo Off (critical)
  try {
    transport.log('tx', 'AT E0');
    const eResp = await transport.send('AT E0', 1200);
    transport.log('rx', eResp);
  } catch {
    // Retry AT E0 once
    try {
      transport.log('tx', 'AT E0');
      const eResp = await transport.send('AT E0', 1200);
      transport.log('rx', eResp);
    } catch {
      transport.log('info', 'AT E0 rejected or unacknowledged, proceeding...');
    }
  }

  // AT L0: Linefeeds Off (optional / clone-tolerant)
  let supportsL0 = true;
  try {
    transport.log('tx', 'AT L0');
    const lResp = await transport.send('AT L0', 1000);
    transport.log('rx', lResp);
    if (lResp.includes('?')) {
      supportsL0 = false;
      unsupported.add('AT L0');
    }
  } catch {
    supportsL0 = false;
  }

  // AT S0: Spaces Off (optional / clone-tolerant)
  let supportsS0 = true;
  try {
    transport.log('tx', 'AT S0');
    const sResp = await transport.send('AT S0', 1000);
    transport.log('rx', sResp);
    if (sResp.includes('?')) {
      supportsS0 = false;
      unsupported.add('AT S0');
    }
  } catch {
    supportsS0 = false;
  }

  // AT H1: Headers On (critical for ECU routing e.g. 7E0 vs 7E4)
  try {
    transport.log('tx', 'AT H1');
    const hResp = await transport.send('AT H1', 1200);
    transport.log('rx', hResp);
  } catch {
    // Retry AT H1 once
    try {
      transport.log('tx', 'AT H1');
      const hResp = await transport.send('AT H1', 1200);
      transport.log('rx', hResp);
    } catch (hErr: any) {
      transport.log('info', `AT H1 unacknowledged (${hErr.message}), proceeding...`);
    }
  }

  stageTimings['config'] = Math.round(performance.now() - tConfigStart);

  // -------------------------------------------------------------
  // 5. Protocol Negotiation: Profile Protocol or AT SP 0 + 0100
  // -------------------------------------------------------------
  const tProtoStart = performance.now();
  let lockedProtocol = '6';

  const cleanProfileProto = profileProtocol
    ? profileProtocol.replace(/^AT\s*SP\s*/i, '').trim()
    : '';

  if (cleanProfileProto) {
    // Use active profile's specified protocol
    transport.log('tx', `AT SP ${cleanProfileProto}`);
    try {
      const spResp = await transport.send(`AT SP ${cleanProfileProto}`, 1500);
      transport.log('rx', spResp);
      if (spResp.includes('?') || spResp.includes('ERROR')) {
        transport.log('info', `AT SP ${cleanProfileProto} rejected. Falling back to auto-search...`);
        lockedProtocol = await detectAndLockProtocol(transport);
      } else {
        lockedProtocol = cleanProfileProto;
      }
    } catch {
      transport.log('info', 'Protocol selection timed out. Falling back to auto-search...');
      lockedProtocol = await detectAndLockProtocol(transport);
    }
  } else {
    // No profile protocol provided: auto-search with 0100 & lock protocol
    lockedProtocol = await detectAndLockProtocol(transport);
  }

  stageTimings['protocol'] = Math.round(performance.now() - tProtoStart);

  // -------------------------------------------------------------
  // 6. Capability Probe: ATI, AT@1, STI, AT AT2
  // -------------------------------------------------------------
  const tCapsStart = performance.now();
  let identity = 'ELM327 Compatible';
  let deviceDescription: string | undefined;
  let isSTN = false;
  let supportsAT2 = false;

  // Probe ATI (Adapter Identity)
  try {
    transport.log('tx', 'ATI');
    const atiResp = await transport.send('ATI', 1200);
    transport.log('rx', atiResp);
    if (atiResp && !atiResp.includes('?')) {
      identity = atiResp.split(/[\r\n]+/)[0].trim() || identity;
    }
  } catch {
    // ignore
  }

  // Probe AT@1 (Device Description)
  try {
    transport.log('tx', 'AT@1');
    const at1Resp = await transport.send('AT@1', 1000);
    transport.log('rx', at1Resp);
    if (at1Resp && !at1Resp.includes('?')) {
      deviceDescription = at1Resp.split(/[\r\n]+/)[0].trim();
    } else {
      unsupported.add('AT@1');
    }
  } catch {
    unsupported.add('AT@1');
  }

  // Probe STI (ScanTool / STN chip identification)
  try {
    transport.log('tx', 'STI');
    const stiResp = await transport.send('STI', 1000);
    transport.log('rx', stiResp);
    if (stiResp && !stiResp.includes('?') && /STN\d+/i.test(stiResp)) {
      isSTN = true;
      transport.log('info', `[STN Detected] ${stiResp}`);
    } else {
      unsupported.add('STI');
    }
  } catch {
    unsupported.add('STI');
  }

  // Probe AT AT2 (Adaptive Timing 2: aggressive timing optimization)
  try {
    transport.log('tx', 'AT AT2');
    const at2Resp = await transport.send('AT AT2', 1000);
    transport.log('rx', at2Resp);
    if (at2Resp && !at2Resp.includes('?') && at2Resp.includes('OK')) {
      supportsAT2 = true;
    } else {
      unsupported.add('AT AT2');
    }
  } catch {
    unsupported.add('AT AT2');
  }

  stageTimings['capabilities'] = Math.round(performance.now() - tCapsStart);

  const totalInitTimeMs = Math.round(performance.now() - tTotalStart);

  // -------------------------------------------------------------
  // 7. Console Diagnostics Summary
  // -------------------------------------------------------------
  transport.log(
    'info',
    `[Init Timings] Sync: ${stageTimings['sync']}ms | Reset: ${stageTimings['reset']}ms | Config: ${stageTimings['config']}ms | Protocol: ${stageTimings['protocol']}ms | Caps: ${stageTimings['capabilities']}ms | Total: ${totalInitTimeMs}ms`
  );
  transport.log(
    'info',
    `[Adapter Profile] ${identity} | Protocol: ${lockedProtocol} | STN: ${isSTN ? 'Yes' : 'No'} | Adaptive Timing: ${supportsAT2 ? 'AT2' : 'Standard'} | L0: ${supportsL0} | S0: ${supportsS0}`
  );

  return {
    identity,
    deviceDescription,
    isSTN,
    protocol: lockedProtocol,
    supportsAT2,
    supportsCRA: isSTN, // STN chips reliably support AT CRA
    supportsResponseCount: true, // Optimistically enabled; downgraded if '?' during polling
    supportsL0,
    supportsS0,
    unsupportedCommands: unsupported,
    stageTimings,
    totalInitTimeMs,
  };
}

/**
 * Searches and locks in the active protocol via AT SP 0, 0100, and AT DPN.
 */
async function detectAndLockProtocol(transport: OBDTransport): Promise<string> {
  // 1. Set auto protocol
  transport.log('tx', 'AT SP 0');
  try {
    const sp0Resp = await transport.send('AT SP 0', 1200);
    transport.log('rx', sp0Resp);
  } catch {
    // continue
  }

  // 2. Transmit standard Mode 01 PID 00 to trigger bus search
  transport.log('tx', '0100');
  try {
    const p00Resp = await transport.send('0100', 3000);
    transport.log('rx', p00Resp);
  } catch {
    transport.log('info', '0100 probe timed out during protocol search');
  }

  // 3. Read detected protocol number
  transport.log('tx', 'AT DPN');
  let detected = '6'; // Default fallback to ISO 15765-4 CAN 11/500
  try {
    const dpnResp = await transport.send('AT DPN', 1200);
    transport.log('rx', dpnResp);
    const cleanDpn = dpnResp.replace(/[^A-Za-z0-9]/g, '');
    // If e.g. "A6", the protocol is "6"
    const match = cleanDpn.match(/[A-Z]?([0-9A-Fa-f])/);
    if (match && match[1]) {
      detected = match[1];
    }
  } catch {
    // keep default '6'
  }

  // 4. Lock in protocol
  transport.log('tx', `AT SP ${detected}`);
  try {
    const lockResp = await transport.send(`AT SP ${detected}`, 1200);
    transport.log('rx', lockResp);
  } catch {
    // continue
  }

  return detected;
}
