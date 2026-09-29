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
}

export const VEHICLE_DEFINITIONS: VehicleDefinition[] = [
  {
    name: 'Ford Mustang Mach-E',
    isDefault: true,
    years: ['all', 2025, 2024, 2023, 2022, 2021],
    repos: ['Ford-Mustang-Mach-E', 'Ford', 'SAEJ1979'],
  },
  {
    name: 'Ford Fusion Hybrid',
    years: ['all', 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013],
    repos: ['Ford-Fusion-Hybrid', 'Ford-Fusion-Energi', 'Ford-Fusion', 'Ford', 'SAEJ1979'],
  },
  {
    name: 'Toyota Highlander',
    years: ['all', 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014],
    repos: ['Toyota-Highlander', 'Toyota-Grand-Highlander-Hybrid', 'Toyota-Grand-Highlander', 'Toyota', 'SAEJ1979'],
  },
  {
    name: 'Standard OBD-II (J1979 only)',
    years: ['all'],
    repos: ['SAEJ1979'],
  },
];

/**
 * Builds the full OBDCommand list for a given vehicle and year from OBDb datasets.
 * Respects repo priority: specific vehicle repo -> make-level fallback -> SAE J1979 standard.
 */
export function buildVehicleCommands(
  vehicleName: string,
  modelYear: number | 'all' = 'all'
): OBDCommand[] {
  const def = VEHICLE_DEFINITIONS.find((v) => v.name === vehicleName) || VEHICLE_DEFINITIONS[0];
  const seenSignalIds = new Set<string>();
  const commands: OBDCommand[] = [];

  for (const repoName of def.repos) {
    const dataset = RAW_OBDB_DATA[repoName];
    if (!dataset || !dataset.commands) continue;

    for (const cmd of dataset.commands) {
      const appCommands = convertOBDbCommandToAppCommands(cmd, vehicleName, modelYear);
      for (const ac of appCommands) {
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
    commands: buildVehicleCommands(def.name, 'all'),
  }));
}

export const INITIAL_VEHICLE_PROFILES: VehicleProfile[] = generateInitialProfiles();
