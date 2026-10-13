import { evaluateFormula, testFormulaSyntax } from '../src/services/formulaParser.ts';
import { parseAndValidateCSV } from '../src/services/csvEngine.ts';
import { extractDataBytes, parseAndEvaluateResponse, isUnsupportedResponse } from '../src/services/obdParser.ts';
import {
  extractBits,
  twosComplement,
  decodeOBDbSignal,
  isServiceAllowed,
  validateCommandSafety,
  matchesYear,
} from '../src/services/obdbParser.ts';
import { buildVehicleCommands, VEHICLE_DEFINITIONS } from '../src/data/defaultVehicles.ts';
import { MockBLEService } from '../src/services/mockBleService.ts';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✓ ${testName}`);
    passed++;
  } else {
    console.error(`✗ ${testName}`);
    failed++;
  }
}

console.log('--- Testing Formula Evaluator ---');
// 1. Engine RPM formula: ((A*256)+B)/4 with A=0x1A (26), B=0xF8 (248) -> (6656 + 248) / 4 = 1726
const rpm = evaluateFormula('((A*256)+B)/4', [0x1A, 0xF8]);
assert(rpm === 1726, `Engine RPM evaluated to ${rpm} (expected 1726)`);

// 2. Coolant Temp: A-40 with A=130 -> 90
const coolant = evaluateFormula('A-40', [130]);
assert(coolant === 90, `Coolant Temp evaluated to ${coolant} (expected 90)`);

// 3. Control Module Voltage: ((A*256)+B)/1000 with A=55 (0x37), B=20 (0x14) -> 14100 / 1000 = 14.1
const volts = evaluateFormula('((A*256)+B)/1000', [55, 20]);
assert(Math.abs(volts - 14.1) < 0.001, `Voltage evaluated to ${volts} (expected 14.1)`);

// 4. Signed 8-bit
const signed8 = evaluateFormula('signed(A)', [254]);
assert(signed8 === -2, `signed(A) evaluated to ${signed8} (expected -2)`);

// 5. Signed 16-bit
const signed16 = evaluateFormula('(signed(A*256+B))/1000', [255, 254]);
assert(Math.abs(signed16 - (-0.002)) < 0.0001, `signed16 evaluated to ${signed16} (expected -0.002)`);

console.log('\n--- Testing OBDb v3 Bit-Level Decoder ---');
// 6. extractBits 16-bit big-endian
const bits16 = extractBits([0x1A, 0xF8], 0, 16);
assert(bits16 === 6904, `extractBits 16-bit: ${bits16} (expected 6904)`);

// 7. extractBits non-byte-aligned (bit index 11, length 1 in [0x00, 0x10])
// Byte 1 has bit 4 set -> bit index 11 is 1
const bit1 = extractBits([0x00, 0x10], 11, 1);
assert(bit1 === 1, `extractBits bit 11: ${bit1} (expected 1)`);

// 8. twosComplement signed 16-bit (0xFC18 = 64536 -> -1000)
const negVal = twosComplement(0xFC18, 16);
assert(negVal === -1000, `twosComplement: ${negVal} (expected -1000)`);

// 9. decodeOBDbSignal with scaling, div, and offset
const decodedSig = decodeOBDbSignal(
  { len: 16, div: 4, min: 0, max: 8000, unit: 'RPM' },
  [0x1A, 0xF8]
);
assert(decodedSig.value === 1726, `decodeOBDbSignal RPM: ${decodedSig.value} (expected 1726)`);

// 10. decodeOBDbSignal with map/enumeration
const enumSig = decodeOBDbSignal(
  {
    len: 1,
    bix: 0,
    map: { '0': 'OFF', '1': 'ON' },
  },
  [0x80] // First bit is 1
);
assert(enumSig.formattedText === 'ON', `decodeOBDbSignal enum: ${enumSig.formattedText} (expected ON)`);

console.log('\n--- Testing Step 4 Safety Allowlist ---');
// 11. Read-only services allowed
assert(isServiceAllowed('01').allowed === true, 'Service 01 allowed');
assert(isServiceAllowed('02').allowed === true, 'Service 02 allowed');
assert(isServiceAllowed('09').allowed === true, 'Service 09 allowed');
assert(isServiceAllowed('19').allowed === true, 'Service 19 allowed');
assert(isServiceAllowed('21').allowed === true, 'Service 21 allowed');
assert(isServiceAllowed('22').allowed === true, 'Service 22 allowed');

// 12. Write / Reset / Actuator services hard-blocked
assert(isServiceAllowed('10').allowed === false, 'Service 10 (Session Control) blocked');
assert(isServiceAllowed('11').allowed === false, 'Service 11 (ECU Reset) blocked');
assert(isServiceAllowed('14').allowed === false, 'Service 14 (Clear DTCs) blocked');
assert(isServiceAllowed('27').allowed === false, 'Service 27 (Security Access) blocked');
assert(isServiceAllowed('2E').allowed === false, 'Service 2E (Write Data) blocked');
assert(isServiceAllowed('2F').allowed === false, 'Service 2F (Actuator Control) blocked');
assert(isServiceAllowed('31').allowed === false, 'Service 31 (Routine Control) blocked');

// 13. validateCommandSafety on PIDs
assert(validateCommandSafety('010C').allowed === true, '010C validated safe');
assert(validateCommandSafety('224899').allowed === true, '224899 validated safe');
assert(validateCommandSafety('2E0101').allowed === false, '2E0101 blocked by safety allowlist');
assert(validateCommandSafety('3101AA').allowed === false, '3101AA blocked by safety allowlist');

console.log('\n--- Testing Unsupported Signals & NRC Detection ---');
// 14. Negative response / NO DATA detection
assert(isUnsupportedResponse('NO DATA') === true, 'NO DATA identified as unsupported');
assert(isUnsupportedResponse('7E8 03 7F 22 11') === true, '7F 22 11 NRC identified as unsupported');
assert(isUnsupportedResponse('7E8 03 7F 22 31') === true, '7F 22 31 NRC identified as unsupported');
assert(isUnsupportedResponse('7E8 04 41 0C 1A F8') === false, 'Valid response not marked unsupported');

console.log('\n--- Testing OBDb Vehicle Catalogs & Year Filtering ---');
// 15. Vehicle profiles generated
const machECmds = buildVehicleCommands('Ford Mustang Mach-E', 'all');
assert(machECmds.length > 500, `Ford Mustang Mach-E imported ${machECmds.length} signals (expected >500)`);

const fusionCmds = buildVehicleCommands('Ford Fusion Hybrid', 'all');
assert(fusionCmds.length > 500, `Ford Fusion Hybrid imported ${fusionCmds.length} signals (expected >500)`);

const highlanderCmds = buildVehicleCommands('Toyota Highlander', 'all');
assert(highlanderCmds.length > 1000, `Toyota Highlander imported ${highlanderCmds.length} signals (expected >1000)`);

const saeCmds = buildVehicleCommands('Standard OBD-II (J1979 only)', 'all');
assert(saeCmds.length > 250, `Standard OBD-II imported ${saeCmds.length} signals (expected >250)`);

// 16. Year filter logic
assert(matchesYear({ from: 2025 }, 2025) === true, 'Year 2025 matches from: 2025');
assert(matchesYear({ from: 2025 }, 2024) === false, 'Year 2024 does not match from: 2025');
assert(matchesYear({ from: 2025 }, 'all') === true, 'Year all matches from: 2025');

console.log('\n--- Testing Dynamic Simulator Mode ---');
// 17. Simulator generates valid frames for vehicle signals
const sim = new MockBLEService(undefined, undefined, () => machECmds);
await sim.connect();
const simRpmResp = await sim.sendCommand('010C');
assert(simRpmResp.includes('41 0C'), `Sim Mode 01 010C response: ${simRpmResp}`);

const simUdsResp = await sim.sendCommand('224899');
assert(simUdsResp.includes('62 48 99'), `Sim Mode 22 224899 response: ${simUdsResp}`);

const simVoltsResp = await sim.sendCommand('AT RV');
assert(simVoltsResp.includes('14.2V'), `Sim AT RV response: ${simVoltsResp}`);
sim.disconnect();

console.log('\n--- Testing Widget Resolver & Protocol Lock Fallbacks ---');
import { findCommandForWidget } from '../src/services/widgetResolver.ts';
const defaultWidgets = [
  { id: 'widget_rpm', slotIndex: 0, signalSourceId: 'std_rpm' },
  { id: 'widget_speed', slotIndex: 1, signalSourceId: 'std_speed' },
  { id: 'widget_coolant', slotIndex: 2, signalSourceId: 'std_coolant' },
];

const resolvedRpm = findCommandForWidget(defaultWidgets[0], machECmds, 0);
assert(!!resolvedRpm && (resolvedRpm.modePid === '010C' || resolvedRpm.commandName.toLowerCase().includes('motor') || resolvedRpm.commandName.toLowerCase().includes('rpm')), `std_rpm mapped to: ${resolvedRpm?.commandName}`);

const resolvedSpeed = findCommandForWidget(defaultWidgets[1], machECmds, 1);
assert(!!resolvedSpeed && (resolvedSpeed.modePid === '010D' || resolvedSpeed.commandName.toLowerCase().includes('speed')), `std_speed mapped to: ${resolvedSpeed?.commandName}`);

const resolvedCoolant = findCommandForWidget(defaultWidgets[2], machECmds, 2);
assert(!!resolvedCoolant && (resolvedCoolant.modePid === '0105' || resolvedCoolant.commandName.toLowerCase().includes('coolant')), `std_coolant mapped to: ${resolvedCoolant?.commandName}`);

// Protocol validation test: STOPPED must never produce 'E'
function parseProtocol(dpnResp, fallback = '6') {
  const cleanDpn = dpnResp.replace(/[^A-Za-z0-9]/g, '');
  const match = cleanDpn.match(/^[Aa]?([1-9A-Ca-c])$/);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return fallback;
}
assert(parseProtocol('STOPPED') === '6', 'STOPPED safely falls back to protocol 6 (not E)');
assert(parseProtocol('A6') === '6', 'A6 correctly resolves to protocol 6');
assert(parseProtocol('6') === '6', '6 correctly resolves to protocol 6');
assert(parseProtocol('?') === '6', '? safely falls back to protocol 6');

console.log('\n--- Testing Significant Figures & Unit Conversions ---');
import {
  formatWithSigFigs,
  formatWithDecimals,
  convertTelemetryValue,
  resolveDisplayValueAndUnit,
  getConvertibleUnitOptions,
} from '../src/services/widgetResolver.ts';

// 1. Sig Figs tests
assert(formatWithSigFigs(1234, 3) === '1,230', `SigFigs 1234 (3 figs) -> ${formatWithSigFigs(1234, 3)} (expected 1,230)`);
assert(formatWithSigFigs(14.28, 3) === '14.3', `SigFigs 14.28 (3 figs) -> ${formatWithSigFigs(14.28, 3)} (expected 14.3)`);
assert(formatWithSigFigs(14.28, 2) === '14', `SigFigs 14.28 (2 figs) -> ${formatWithSigFigs(14.28, 2)} (expected 14)`);
assert(formatWithSigFigs(0.04567, 3) === '0.0457', `SigFigs 0.04567 (3 figs) -> ${formatWithSigFigs(0.04567, 3)} (expected 0.0457)`);
assert(formatWithSigFigs(0, 3) === '0', `SigFigs 0 -> ${formatWithSigFigs(0, 3)} (expected 0)`);

// 2. Unit conversion tests
const kmhToMph = convertTelemetryValue(100, 'km/h', 'mph');
assert(Math.abs(kmhToMph.value - 62.1371) < 0.01, `100 km/h -> ${kmhToMph.value} mph`);
assert(kmhToMph.unit === 'mph', 'Result unit is mph');

const cToF = convertTelemetryValue(90, '°C', '°F');
assert(Math.abs(cToF.value - 194) < 0.01, `90 °C -> ${cToF.value} °F`);
assert(cToF.unit === '°F', 'Result unit is °F');

const speedOptions = getConvertibleUnitOptions('km/h');
assert(Array.isArray(speedOptions) && speedOptions.includes('mph') && speedOptions.includes('km/h'), 'km/h offers mph and km/h');

const tempOptions = getConvertibleUnitOptions('°C');
assert(Array.isArray(tempOptions) && tempOptions.includes('°F') && tempOptions.includes('°C'), '°C offers °F and °C');

const resolved = resolveDisplayValueAndUnit(100, { precision: 'sig3', unitOverride: 'mph' }, 'km/h');
assert(resolved.formatted === '62.1', `100 km/h with sig3 + mph -> ${resolved.formatted} (expected 62.1)`);
assert(resolved.unit === 'mph', 'Resolved unit is mph');

console.log(`\n================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`================================`);
if (failed > 0) process.exit(1);

