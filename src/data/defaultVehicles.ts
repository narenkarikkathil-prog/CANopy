/**
 * defaultVehicles.ts
 * Vehicle catalog built entirely from the OBDb Community Database (CC BY-SA 4.0).
 * Replaces all hardcoded command tables with comprehensive OBDb signalsets.
 */

import type { VehicleProfile, OBDCommand } from '../types/telemetry';
import { RAW_OBDB_DATA } from './obdbBundle';
import { convertOBDbCommandToAppCommands } from '../services/obdbParser';

export interface VehicleDefinition {
  name: string;
  isDefault?: boolean;
  years: Array<number | 'all'>;
  repos: string[];
  protocol?: string; // e.g. '6' for ISO 15765-4 CAN 11/500
  type?: 'ev' | 'hybrid' | 'ice';
}

export const VEHICLE_DEFINITIONS: VehicleDefinition[] = [
  {
    name: 'Ford Mustang Mach-E',
    isDefault: true,
    years: ['all', 2025, 2024, 2023, 2022, 2021],
    // All-electric vehicle: strictly use dedicated EV commands; never inherit gas or ICE PIDs
    repos: ['Ford-Mustang-Mach-E'],
    protocol: '6',
    type: 'ev',
  },
  {
    name: 'Ford Fusion Hybrid',
    years: ['all', 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013],
    repos: ['Ford-Fusion-Hybrid', 'Ford-Fusion-Energi', 'Ford-Fusion', 'Ford', 'SAEJ1979'],
    protocol: '6',
    type: 'hybrid',
  },
  {
    name: 'Toyota Highlander',
    years: ['all', 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014],
    repos: ['Toyota-Highlander', 'Toyota-Grand-Highlander-Hybrid', 'Toyota-Grand-Highlander', 'Toyota', 'SAEJ1979'],
    protocol: '6',
    type: 'ice',
  },
  {
    name: 'Standard OBD-II (J1979 only)',
    years: ['all'],
    repos: ['SAEJ1979'],
    protocol: '6',
    type: 'ice',
  },
];

/**
 * Returns true if a command or signal represents an Internal Combustion Engine (ICE),
 * gas fuel system, exhaust, spark, or emissions component inapplicable to an EV.
 */
export function isGasOrIceSignal(cmd: OBDCommand): boolean {
  const pid = (cmd.modePid || '').toUpperCase();
  const name = (cmd.commandName || '').toLowerCase();
  const desc = (cmd.description || '').toLowerCase();
  const cat = (cmd.category || '').toLowerCase();
  const id = (cmd.id || '').toLowerCase();

  // Mode 01 standard ICE PIDs
  const icePids = new Set([
    '0103', '0104', '0105', '0106', '0107', '0108', '0109', '010A', '010B', '010C',
    '010E', '010F', '0110', '0111', '0112', '0113', '0114', '0115', '0116', '0117',
    '0118', '0119', '011A', '011B', '011E', '011F', '0122', '0123', '012E', '012F',
    '0132', '013C', '013D', '013E', '013F', '0143', '0144', '0145', '0147', '0148',
    '0149', '014A', '014B', '0151', '0152', '0153', '0154', '0159', '015C', '015D',
    '015E',
  ]);
  if (icePids.has(pid)) return true;

  // Internal Combustion Engine / gas terminology (using word boundaries or exact phrases)
  const iceRegexes = [
    /\bfuel\b/i,
    /\bgasoline\b/i,
    /\bdiesel\b/i,
    /\bethanol\b/i,
    /\bengine\s+(rpm|speed|coolant|load|oil|run\s*time)\b/i,
    /\b(engine\s+oil|oil\s+(temp|temperature|pressure|life|level))\b/i,
    /\b(catalyst|catalytic)\b/i,
    /\b(spark|ignition\s+timing|timing\s+advance)\b/i,
    /\b(cylinder|misfire|camshaft|crankshaft)\b/i,
    /\b(exhaust|intake\s+manifold|maf|map\s+sensor)\b/i,
    /\b(evap|evaporative)\b/i,
    /\b(oxygen\s+sensor|o2\s+sensor|lambda)\b/i,
    /\b(throttle\s+position|throttle\s+body)\b/i,
  ];

  const text = `${name} ${desc} ${cat} ${id}`;
  for (const re of iceRegexes) {
    if (re.test(text)) return true;
  }

  return false;
}

/**
 * Builds the full OBDCommand list for a given vehicle and year from OBDb datasets.
 * Respects repo priority: specific vehicle repo -> make-level fallback -> SAE J1979 standard.
 * Automatically excludes internal combustion & gas signals for electric vehicles.
 */
export function buildVehicleCommands(
  vehicleName: string,
  modelYear: number | 'all' = 'all'
): OBDCommand[] {
  const def = VEHICLE_DEFINITIONS.find((v) => v.name === vehicleName) || VEHICLE_DEFINITIONS[0];
  const seenSignalIds = new Set<string>();
  const commands: OBDCommand[] = [];
  const isEv = def.type === 'ev' || vehicleName.toLowerCase().includes('mach-e');

  for (const repoName of def.repos) {
    const dataset = RAW_OBDB_DATA[repoName];
    if (!dataset || !dataset.commands) continue;

    for (const cmd of dataset.commands) {
      const appCommands = convertOBDbCommandToAppCommands(cmd, vehicleName, modelYear);
      for (const ac of appCommands) {
        // If vehicle is electric, filter out any ICE or gas signals
        if (isEv && isGasOrIceSignal(ac)) {
          continue;
        }

        // De-duplicate by the underlying OBDb signal ID
        const rawSigId = ac.id.replace(/^[^_]+_/, '');
        if (!seenSignalIds.has(rawSigId)) {
          seenSignalIds.add(rawSigId);
          commands.push(ac);
        }
      }
    }
  }

  return commands;
}

/**
 * Generates initial vehicle profiles for the 4 supported vehicle configurations.
 */
export function generateInitialProfiles(): VehicleProfile[] {
  return VEHICLE_DEFINITIONS.map((def) => ({
    name: def.name,
    isDefault: def.isDefault,
    protocol: def.protocol || '6',
    commands: buildVehicleCommands(def.name, 'all'),
  }));
}

export const INITIAL_VEHICLE_PROFILES: VehicleProfile[] = generateInitialProfiles();
