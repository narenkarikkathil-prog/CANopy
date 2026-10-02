import type { OBDCommand } from '../types/telemetry';

export const REQUIRED_HEADERS = [
  'VEHICLE_NAME',
  'COMMAND_NAME',
  'HEADER',
  'MODE_PID',
  'FORMULA',
  'UNITS',
  'MIN_VAL',
  'MAX_VAL',
] as const;

export interface CSVValidationError {
  row: number;
  column?: string;
  message: string;
}

export interface CSVParseResult {
  success: boolean;
  errors: CSVValidationError[];
  groupedByVehicle: Record<string, OBDCommand[]>;
  totalRows: number;
}

/**
 * Parses a standard CSV string into rows and cells, respecting double quotes.
 */
function parseCSVRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l].trim();
    if (!line) continue; // Skip blank lines

    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        if (inQuotes && c + 1 < line.length && line[c + 1] === '"') {
          current += '"';
          c++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }

  return rows;
}

/**
 * Validates and ingests a vehicle command CSV file.
 * Completely rejects file if ANY row or header is invalid.
 */
export function parseAndValidateCSV(
  csvText: string,
  fileId?: string,
  fileName?: string
): CSVParseResult {
  const errors: CSVValidationError[] = [];
  const rawRows = parseCSVRows(csvText);

  if (rawRows.length === 0) {
    return {
      success: false,
      errors: [{ row: 1, message: 'CSV file is completely empty' }],
      groupedByVehicle: {},
      totalRows: 0,
    };
  }

  // 1. Validate Header Row
  const headerRow = rawRows[0];
  if (headerRow.length !== REQUIRED_HEADERS.length) {
    return {
      success: false,
      errors: [
        {
          row: 1,
          message: `Header count mismatch. Expected ${REQUIRED_HEADERS.length} columns, found ${headerRow.length}. Required order: ${REQUIRED_HEADERS.join(', ')}`,
        },
      ],
      groupedByVehicle: {},
      totalRows: 0,
    };
  }

  for (let colIdx = 0; colIdx < REQUIRED_HEADERS.length; colIdx++) {
    const expected = REQUIRED_HEADERS[colIdx];
    const actual = (headerRow[colIdx] || '').trim().toUpperCase();
    if (actual !== expected) {
      errors.push({
        row: 1,
        column: expected,
        message: `Header mismatch at column ${colIdx + 1}. Expected "${expected}", but found "${headerRow[colIdx]}"`,
      });
    }
  }

  // If header has errors, reject immediately
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      groupedByVehicle: {},
      totalRows: 0,
    };
  }

  const groupedByVehicle: Record<string, OBDCommand[]> = {};

  // 2. Validate Data Rows (1-indexed row numbers: line 1 = header, data starts at line 2)
  for (let r = 1; r < rawRows.length; r++) {
    const rowNum = r + 1;
    const cells = rawRows[r];

    if (cells.length !== REQUIRED_HEADERS.length) {
      errors.push({
        row: rowNum,
        message: `Expected ${REQUIRED_HEADERS.length} fields, found ${cells.length}`,
      });
      continue;
    }

    const [vehicleName, commandName, header, modePid, formula, units, minValStr, maxValStr] = cells;

    // Validate non-empty fields
    if (!vehicleName) {
      errors.push({ row: rowNum, column: 'VEHICLE_NAME', message: 'Vehicle Name cannot be empty' });
    }
    if (!commandName) {
      errors.push({ row: rowNum, column: 'COMMAND_NAME', message: 'Command Name cannot be empty' });
    }
    if (!header) {
      errors.push({ row: rowNum, column: 'HEADER', message: 'Header/CAN ID cannot be empty' });
    }
    if (!modePid) {
      errors.push({ row: rowNum, column: 'MODE_PID', message: 'Mode/PID cannot be empty' });
    }
    if (!formula) {
      errors.push({ row: rowNum, column: 'FORMULA', message: 'Formula cannot be empty' });
    }
    if (!units) {
      errors.push({ row: rowNum, column: 'UNITS', message: 'Units cannot be empty' });
    }

    // Validate min/max numbers
    const minVal = parseFloat(minValStr);
    const maxVal = parseFloat(maxValStr);
    if (isNaN(minVal)) {
      errors.push({ row: rowNum, column: 'MIN_VAL', message: `Invalid numeric value: "${minValStr}"` });
    }
    if (isNaN(maxVal)) {
      errors.push({ row: rowNum, column: 'MAX_VAL', message: `Invalid numeric value: "${maxValStr}"` });
    }

    if (errors.length === 0) {
      if (!groupedByVehicle[vehicleName]) {
        groupedByVehicle[vehicleName] = [];
      }

      const id = fileId
        ? `csv_${fileId}_${vehicleName}_${commandName}`.toLowerCase().replace(/[^a-z0-9]/g, '_')
        : `${vehicleName}_${commandName}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
      groupedByVehicle[vehicleName].push({
        id,
        vehicleName,
        commandName,
        header,
        modePid,
        formula,
        units,
        minVal: isNaN(minVal) ? 0 : minVal,
        maxVal: isNaN(maxVal) ? 100 : maxVal,
        isCustom: true,
        category: 'Custom / CSV',
        sourceCsvId: fileId,
        sourceCsvName: fileName,
      });
    }
  }

  // Reject whole file if ANY error exists
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      groupedByVehicle: {},
      totalRows: rawRows.length - 1,
    };
  }

  return {
    success: true,
    errors: [],
    groupedByVehicle,
    totalRows: rawRows.length - 1,
  };
}
