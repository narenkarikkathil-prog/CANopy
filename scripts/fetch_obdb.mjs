#!/usr/bin/env node
/**
 * fetch_obdb.mjs
 * Downloads raw signalsets from github.com/OBDb for target vehicles,
 * make-level fallbacks, and SAE J1979 standard PIDs.
 * Saves raw JSON into data/obdb/<repo>/ preserving directory structure.
 * Re-runnable to refresh database.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data', 'obdb');

const TARGET_REPOS = [
  'Ford-Mustang-Mach-E',
  'Ford-Fusion-Hybrid',
  'Ford-Fusion',
  'Ford-Fusion-Energi',
  'Toyota-Highlander',
  'Toyota-Grand-Highlander',
  'Toyota-Grand-Highlander-Hybrid',
  'Ford',
  'Toyota',
  'SAEJ1979',
];

const GITHUB_API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

const headers = {
  'User-Agent': 'CANopy-OBDb-Fetcher/1.0',
};

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} [HTTP ${res.status}: ${res.statusText}]`);
  }
  return await res.json();
}

async function fetchRepoSignalsets(repoName) {
  console.log(`\nFetching signalset files for ${repoName}...`);
  const repoDataDir = path.join(DATA_DIR, repoName, 'signalsets', 'v3');
  fs.mkdirSync(repoDataDir, { recursive: true });

  // 1. Check tree or directory contents for signalsets/v3
  let filesToFetch = ['default.json'];

  try {
    const contentsUrl = `${GITHUB_API_BASE}/repos/OBDb/${repoName}/contents/signalsets/v3`;
    const items = await fetchJson(contentsUrl);
    if (Array.isArray(items)) {
      filesToFetch = items
        .filter((item) => item.type === 'file' && item.name.endsWith('.json'))
        .map((item) => item.name);
    }
  } catch (err) {
    console.warn(`  Notice: Could not list directory contents via API for ${repoName} (${err.message}), falling back to default.json`);
  }

  const downloadedFiles = [];

  for (const fileName of filesToFetch) {
    const rawUrl = `${RAW_BASE}/OBDb/${repoName}/main/signalsets/v3/${fileName}`;
    try {
      let res = await fetch(rawUrl, { headers });
      if (!res.ok) {
        // Try master branch
        const masterUrl = `${RAW_BASE}/OBDb/${repoName}/master/signalsets/v3/${fileName}`;
        res = await fetch(masterUrl, { headers });
      }

      if (!res.ok) {
        console.warn(`  Could not download ${fileName} from main or master for ${repoName}`);
        continue;
      }

      const content = await res.text();
      const targetFilePath = path.join(repoDataDir, fileName);
      fs.writeFileSync(targetFilePath, content, 'utf8');

      // Validate JSON
      const parsed = JSON.parse(content);
      const commandCount = parsed.commands?.length || 0;
      let signalCount = 0;
      if (parsed.commands) {
        for (const cmd of parsed.commands) {
          if (cmd.signals) signalCount += cmd.signals.length;
        }
      }

      console.log(`  ✓ Saved ${fileName}: ${commandCount} commands, ${signalCount} signals`);
      downloadedFiles.push({ fileName, commandCount, signalCount });
    } catch (err) {
      console.error(`  ✗ Error downloading ${fileName} for ${repoName}:`, err.message);
    }
  }

  return { repoName, downloadedFiles };
}

async function main() {
  console.log('==============================================');
  console.log('OBDb Signalset Fetcher for CANopy');
  console.log(`Saving to: ${DATA_DIR}`);
  console.log('==============================================');

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const summary = [];

  for (const repo of TARGET_REPOS) {
    try {
      const result = await fetchRepoSignalsets(repo);
      summary.push(result);
    } catch (err) {
      console.error(`Failed to process repo ${repo}:`, err);
    }
  }

  // Create ATTRIBUTION and LICENSE files in data/obdb/
  const licenseContent = `Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)

This directory contains vehicle signal definitions, PIDs, and diagnostic commands
sourced from the OBDb Community Database:
https://github.com/OBDb

Under the terms of CC BY-SA 4.0:
You are free to:
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material for any purpose

Under the following terms:
- Attribution — You must give appropriate credit, provide a link to the license,
  and indicate if changes were made.
- ShareAlike — If you remix, transform, or build upon the material, you must
  distribute your contributions under the same license as the original.

Full license text: https://creativecommons.org/licenses/by-sa/4.0/
`;
  fs.writeFileSync(path.join(DATA_DIR, 'LICENSE'), licenseContent, 'utf8');

  const attributionContent = `# OBDb Community Database Attribution

CANopy incorporates vehicle telemetry commands and signal specifications from the **OBDb Project** (Open On-Board Diagnostics Database).

- Project URL: [https://github.com/OBDb](https://github.com/OBDb)
- Community: [https://obdb.community](https://obdb.community)
- License: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)

## Contributing Repositories Used

1. **OBDb/Ford-Mustang-Mach-E**: Dedicated Mach-E battery, drive unit, thermal, and charger parameters.
2. **OBDb/Ford-Fusion-Hybrid**: Hybrid battery and powertrain diagnostic commands.
3. **OBDb/Ford-Fusion**: Gas/Hybrid Fusion vehicle parameters.
4. **OBDb/Ford-Fusion-Energi**: Plug-in hybrid high-voltage and charging signal sets.
5. **OBDb/Toyota-Highlander**: Highlander vehicle definition.
6. **OBDb/Toyota-Grand-Highlander** & **OBDb/Toyota-Grand-Highlander-Hybrid**: Extended Highlander platform definitions.
7. **OBDb/Ford**: Ford make-level fallback parameters (engine, transmission, hybrid, battery).
8. **OBDb/Toyota**: Toyota make-level fallback parameters (engine, hybrid synergy drive, HV battery, TPMS).
9. **OBDb/SAEJ1979**: Universal SAE J1979 standard Mode 01/02 diagnostic parameter IDs.

Downloaded on: ${new Date().toISOString()}
`;
  fs.writeFileSync(path.join(DATA_DIR, 'ATTRIBUTION.md'), attributionContent, 'utf8');

  console.log('\n==============================================');
  console.log('Fetch Summary:');
  for (const s of summary) {
    const fileSummary = s.downloadedFiles
      .map((f) => `${f.fileName} (${f.commandCount} cmds, ${f.signalCount} sigs)`)
      .join(', ');
    console.log(`- ${s.repoName}: ${fileSummary || 'none'}`);
  }
  console.log('==============================================');
}

main().catch((err) => {
  console.error('Fatal fetch error:', err);
  process.exit(1);
});
