/**
 * obdbBundle.ts
 * Statically bundled OBDb datasets for offline operation.
 * Sourced directly from data/obdb/ preserving OBDb community data.
 */

import type { OBDbDataset } from '../services/obdbParser';

// Statically import raw OBDb datasets
import machEJson from '../../data/obdb/Ford-Mustang-Mach-E/signalsets/v3/default.json' with { type: 'json' };
import fusionHybridJson from '../../data/obdb/Ford-Fusion-Hybrid/signalsets/v3/default.json' with { type: 'json' };
import fusionJson from '../../data/obdb/Ford-Fusion/signalsets/v3/default.json' with { type: 'json' };
import fusionEnergiJson from '../../data/obdb/Ford-Fusion-Energi/signalsets/v3/default.json' with { type: 'json' };
import highlanderJson from '../../data/obdb/Toyota-Highlander/signalsets/v3/default.json' with { type: 'json' };
import grandHighlanderJson from '../../data/obdb/Toyota-Grand-Highlander/signalsets/v3/default.json' with { type: 'json' };
import grandHighlanderHybridJson from '../../data/obdb/Toyota-Grand-Highlander-Hybrid/signalsets/v3/default.json' with { type: 'json' };
import fordJson from '../../data/obdb/Ford/signalsets/v3/default.json' with { type: 'json' };
import toyotaJson from '../../data/obdb/Toyota/signalsets/v3/default.json' with { type: 'json' };
import saeJ1979Json from '../../data/obdb/SAEJ1979/signalsets/v3/default.json' with { type: 'json' };

export const RAW_OBDB_DATA: Record<string, OBDbDataset> = {
  'Ford-Mustang-Mach-E': machEJson as OBDbDataset,
  'Ford-Fusion-Hybrid': fusionHybridJson as OBDbDataset,
  'Ford-Fusion': fusionJson as OBDbDataset,
  'Ford-Fusion-Energi': fusionEnergiJson as OBDbDataset,
  'Toyota-Highlander': highlanderJson as OBDbDataset,
  'Toyota-Grand-Highlander': grandHighlanderJson as OBDbDataset,
  'Toyota-Grand-Highlander-Hybrid': grandHighlanderHybridJson as OBDbDataset,
  Ford: fordJson as OBDbDataset,
  Toyota: toyotaJson as OBDbDataset,
  SAEJ1979: saeJ1979Json as OBDbDataset,
};
