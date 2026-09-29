import { evaluateFormula } from './formulaParser';
import { decodeOBDbSignal, type OBDbSignalFmt } from './obdbParser';

/**
 * Checks if a response indicates the signal or PID is unsupported by the ECU.
 * Matches:
 * - NO DATA
 * - ERROR / ? / UNABLE TO CONNECT
 * - UDS Negative Response Service (0x7F): e.g. "7F 22 11", "7F 01 12", "7F 22 31"
 */
export function isUnsupportedResponse(response: string): boolean {
  const clean = response.trim().toUpperCase();
  if (
    clean.includes('NO DATA') ||
    clean.includes('ERROR') ||
    clean.includes('?') ||
    clean.includes('UNABLE') ||
    clean.includes('BUS INIT: ERROR')
  ) {
    return true;
  }

  // Check 7F negative response
  const tokens = clean.split(/\s+/);
  const sevenFIdx = tokens.indexOf('7F');
  if (sevenFIdx !== -1 && tokens.length > sevenFIdx + 2) {
    // 7F <ServiceId> <NRC> (e.g. 11=ServiceNotSupported, 12=SubFunctionNotSupported, 31=RequestOutOfRange)
    return true;
  }

  return false;
}

/**
 * Extracts data bytes (A, B, C, ...) from an ELM327 CAN/OBD response.
 * Handles CAN 11-bit header format (e.g. "7E8 04 41 0C 1A F8" or "7E8 05 62 48 99 03 E8")
 * or non-header format ("41 0C 1A F8").
 */
export function extractDataBytes(response: string, modePid: string): number[] {
  // Strip whitespace, newlines, and prompt characters
  const clean = response.replace(/[>\r\n]/g, ' ').trim();
  if (!clean || isUnsupportedResponse(clean)) {
    return [];
  }

  // Tokenize hex strings
  const tokens = clean.split(/\s+/).filter((t) => /^[0-9A-Fa-f]{2,3}$/.test(t));
  if (tokens.length === 0) return [];

  const cleanPid = modePid.replace(/\s+/g, '').toUpperCase();
  const mode = cleanPid.slice(0, 2); // e.g. "01" or "22"
  const expectedEcho = (parseInt(mode, 16) + 0x40).toString(16).toUpperCase().padStart(2, '0'); // e.g. "41" or "62"

  // Locate the echo byte (e.g. 41 or 62)
  const echoIdx = tokens.findIndex((t) => t.toUpperCase() === expectedEcho);
  if (echoIdx === -1) {
    return [];
  }

  // Determine how many bytes belong to the PID itself
  // For Mode 01/21: PID is 1 byte (e.g. "0C" -> 1 token)
  // For Mode 22: PID is 2 bytes (e.g. "4899" -> 2 tokens: "48", "99")
  const pidHex = cleanPid.slice(2);
  const pidByteCount = pidHex.length / 2;

  const dataStartIndex = echoIdx + 1 + pidByteCount;
  const dataTokens = tokens.slice(dataStartIndex);

  return dataTokens.map((hex) => parseInt(hex, 16));
}

/**
 * Parses response and computes the final numeric value using either the OBDb format specification
 * (with bit-level extraction and scaling) or the algebraic formula.
 */
export function parseAndEvaluateResponse(
  response: string,
  modePid: string,
  formula: string,
  obdbFmt?: OBDbSignalFmt
): number | null {
  try {
    if (isUnsupportedResponse(response)) return null;

    const bytes = extractDataBytes(response, modePid);
    if (bytes.length === 0) return null;

    // Use bit-level OBDb decoder if format specification is present
    if (obdbFmt) {
      const decoded = decodeOBDbSignal(obdbFmt, bytes);
      return isNaN(decoded.value) || !isFinite(decoded.value) ? null : decoded.value;
    }

    // Fall back to algebraic formula evaluator
    const value = evaluateFormula(formula, bytes);
    return isNaN(value) || !isFinite(value) ? null : value;
  } catch (err) {
    console.warn(`Error evaluating response "${response}" for PID "${modePid}":`, err);
    return null;
  }
}
