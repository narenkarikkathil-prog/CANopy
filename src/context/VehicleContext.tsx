import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { OBDCommand, VehicleProfile, UploadedCsvFile } from '../types/telemetry';
import {
  INITIAL_VEHICLE_PROFILES,
  VEHICLE_DEFINITIONS,
  buildVehicleCommands,
} from '../data/defaultVehicles';
import {
  loadVehicles,
  saveVehicles,
  loadActiveVehicleName,
  saveActiveVehicleName,
  loadUploadedCsvFiles,
  saveUploadedCsvFiles,
} from '../services/storage';
import { parseAndValidateCSV, type CSVParseResult } from '../services/csvEngine';

interface VehicleContextType {
  vehicles: VehicleProfile[];
  activeVehicleName: string;
  activeVehicle: VehicleProfile;
  availableCommands: OBDCommand[];
  selectedYear: number | 'all';
  setSelectedYear: (year: number | 'all') => void;
  availableYears: Array<number | 'all'>;
  setActiveVehicleName: (name: string) => Promise<void>;
  addCustomCommand: (command: Omit<OBDCommand, 'id'>) => Promise<OBDCommand>;
  deleteCommand: (commandId: string) => Promise<void>;
  uploadedCsvFiles: UploadedCsvFile[];
  deleteUploadedCsv: (fileId: string) => Promise<void>;
  deleteAllCustomCommands: (vehicleName?: string) => Promise<void>;
  importCSVText: (csvText: string, fileName?: string) => Promise<CSVParseResult>;
  resetToDefaults: () => Promise<void>;
}

const VehicleContext = createContext<VehicleContextType | null>(null);

export const VehicleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<VehicleProfile[]>(INITIAL_VEHICLE_PROFILES);
  const [activeVehicleName, setActiveVehicleNameState] = useState<string>('Ford Mustang Mach-E');
  const [selectedYear, setSelectedYearState] = useState<number | 'all'>('all');
  const [uploadedCsvFiles, setUploadedCsvFiles] = useState<UploadedCsvFile[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize from storage on mount
  useEffect(() => {
    async function init() {
      const storedVehicles = await loadVehicles();
      const storedActive = await loadActiveVehicleName();
      const storedCsvFiles = await loadUploadedCsvFiles();

      let currentVehicles = storedVehicles;
      // If no stored vehicles or if stale previous profiles (e.g. Generic OBD-II, Focus RS), reset to OBDb
      const hasOBDbProfiles = currentVehicles?.some((v) => v.name === 'Ford Mustang Mach-E');
      if (!currentVehicles || currentVehicles.length === 0 || !hasOBDbProfiles) {
        currentVehicles = INITIAL_VEHICLE_PROFILES;
        await saveVehicles(currentVehicles);
      }
      setVehicles(currentVehicles);

      if (storedCsvFiles && storedCsvFiles.length > 0) {
        setUploadedCsvFiles(storedCsvFiles);
      }

      const targetActive =
        storedActive && currentVehicles.some((v) => v.name === storedActive)
          ? storedActive
          : 'Ford Mustang Mach-E';

      setActiveVehicleNameState(targetActive);
      setInitialized(true);
    }

    init();
  }, []);

  const setActiveVehicleName = async (name: string) => {
    setActiveVehicleNameState(name);
    setSelectedYearState('all'); // Reset year to 'all' when switching vehicles
    await saveActiveVehicleName(name);
  };

  const setSelectedYear = (year: number | 'all') => {
    setSelectedYearState(year);
  };

  // Look up available model years for the active vehicle
  const availableYears: Array<number | 'all'> = useMemo(() => {
    const def = VEHICLE_DEFINITIONS.find((v) => v.name === activeVehicleName);
    return def?.years || ['all'];
  }, [activeVehicleName]);

  const activeVehicle = useMemo(() => {
    return (
      vehicles.find((v) => v.name === activeVehicleName) ||
      vehicles[0] ||
      INITIAL_VEHICLE_PROFILES[0]
    );
  }, [vehicles, activeVehicleName]);

  // Dynamically resolve available commands based on active vehicle and selected model year
  const availableCommands = useMemo(() => {
    // 1. Get OBDb commands for active vehicle and selected year
    const baseCommands = buildVehicleCommands(activeVehicleName, selectedYear);

    // 2. Merge any custom commands the user created for this vehicle
    const customCommands = (activeVehicle?.commands || []).filter((c) => c.isCustom);

    return [...baseCommands, ...customCommands];
  }, [activeVehicleName, selectedYear, activeVehicle]);

  const addCustomCommand = async (newCmd: Omit<OBDCommand, 'id'>): Promise<OBDCommand> => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fullCmd: OBDCommand = {
      ...newCmd,
      id,
      isCustom: true,
      vehicleName: activeVehicleName,
    };

    const updatedVehicles = vehicles.map((v) => {
      if (v.name === activeVehicleName) {
        // Upsert by commandName
        const existingIdx = v.commands.findIndex(
          (c) => c.commandName.toLowerCase() === fullCmd.commandName.toLowerCase()
        );
        const newCmds = [...v.commands];
        if (existingIdx >= 0) {
          newCmds[existingIdx] = fullCmd;
        } else {
          newCmds.push(fullCmd);
        }
        return { ...v, commands: newCmds };
      }
      return v;
    });

    setVehicles(updatedVehicles);
    await saveVehicles(updatedVehicles);
    return fullCmd;
  };

  const deleteCommand = async (commandId: string) => {
    let deletedCommand: OBDCommand | undefined;
    const updatedVehicles = vehicles.map((v) => {
      const found = v.commands.find((c) => c.id === commandId);
      if (found) deletedCommand = found;
      return {
        ...v,
        commands: v.commands.filter((c) => c.id !== commandId),
      };
    });

    setVehicles(updatedVehicles);
    await saveVehicles(updatedVehicles);

    // If this command came from an uploaded CSV file, sync the remaining count
    if (deletedCommand?.sourceCsvId) {
      const fileId = deletedCommand.sourceCsvId;
      const remainingCount = updatedVehicles
        .flatMap((v) => v.commands)
        .filter((c) => c.sourceCsvId === fileId).length;

      const updatedCsvFiles = uploadedCsvFiles.map((f) =>
        f.id === fileId ? { ...f, commandCount: remainingCount } : f
      );
      setUploadedCsvFiles(updatedCsvFiles);
      await saveUploadedCsvFiles(updatedCsvFiles);
    }
  };

  const deleteUploadedCsv = async (fileId: string) => {
    const fileToDelete = uploadedCsvFiles.find((f) => f.id === fileId);
    if (!fileToDelete) return;

    // 1. Remove all commands associated with this CSV file across all vehicles
    let updatedVehicles = vehicles.map((v) => ({
      ...v,
      commands: v.commands.filter((c) => c.sourceCsvId !== fileId),
    }));

    // 2. Clean up any custom vehicle profiles created solely for this CSV that now have 0 commands
    const defaultNames = new Set(VEHICLE_DEFINITIONS.map((d) => d.name));
    updatedVehicles = updatedVehicles.filter((v) => {
      if (defaultNames.has(v.name)) return true;
      return v.commands.length > 0;
    });

    // 3. Fallback active vehicle if the current active one was removed
    if (!updatedVehicles.some((v) => v.name === activeVehicleName)) {
      const fallbackName = updatedVehicles[0]?.name || 'Ford Mustang Mach-E';
      setActiveVehicleNameState(fallbackName);
      await saveActiveVehicleName(fallbackName);
    }

    // 4. Remove CSV file record from storage
    const remainingCsvFiles = uploadedCsvFiles.filter((f) => f.id !== fileId);
    setUploadedCsvFiles(remainingCsvFiles);
    await saveUploadedCsvFiles(remainingCsvFiles);

    setVehicles(updatedVehicles);
    await saveVehicles(updatedVehicles);
  };

  const deleteAllCustomCommands = async (vehicleName?: string) => {
    const targetVehicle = vehicleName || activeVehicleName;
    const updatedVehicles = vehicles.map((v) => {
      if (v.name === targetVehicle) {
        return {
          ...v,
          commands: v.commands.filter((c) => !c.isCustom),
        };
      }
      return v;
    });

    // Recalculate commandCount on uploadedCsvFiles
    const updatedCsvFiles = uploadedCsvFiles.map((f) => {
      const remainingCount = updatedVehicles
        .flatMap((v) => v.commands)
        .filter((c) => c.sourceCsvId === f.id).length;
      return { ...f, commandCount: remainingCount };
    });

    setUploadedCsvFiles(updatedCsvFiles);
    await saveUploadedCsvFiles(updatedCsvFiles);
    setVehicles(updatedVehicles);
    await saveVehicles(updatedVehicles);
  };

  const importCSVText = async (
    csvText: string,
    fileName: string = 'custom_commands.csv'
  ): Promise<CSVParseResult> => {
    const fileId = `csv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const result = parseAndValidateCSV(csvText, fileId, fileName);
    if (!result.success) {
      return result;
    }

    const updatedVehicles = [...vehicles];
    let totalImported = 0;
    const affectedVehicles: string[] = [];

    for (const [vName, importedCmds] of Object.entries(result.groupedByVehicle)) {
      affectedVehicles.push(vName);
      totalImported += importedCmds.length;

      const existingVehicleIdx = updatedVehicles.findIndex((v) => v.name === vName);

      if (existingVehicleIdx >= 0) {
        const vehicle = { ...updatedVehicles[existingVehicleIdx] };
        const cmds = [...vehicle.commands];

        for (const imported of importedCmds) {
          const cmdIdx = cmds.findIndex(
            (c) => c.commandName.toLowerCase() === imported.commandName.toLowerCase()
          );
          if (cmdIdx >= 0) {
            cmds[cmdIdx] = imported;
          } else {
            cmds.push(imported);
          }
        }
        vehicle.commands = cmds;
        updatedVehicles[existingVehicleIdx] = vehicle;
      } else {
        updatedVehicles.push({
          name: vName,
          commands: importedCmds,
        });
      }
    }

    const newFileRecord: UploadedCsvFile = {
      id: fileId,
      fileName,
      uploadedAt: Date.now(),
      rowCount: result.totalRows,
      commandCount: totalImported,
      vehicleNames: affectedVehicles,
    };

    const nextCsvFiles = [newFileRecord, ...uploadedCsvFiles];
    setUploadedCsvFiles(nextCsvFiles);
    await saveUploadedCsvFiles(nextCsvFiles);

    setVehicles(updatedVehicles);
    await saveVehicles(updatedVehicles);

    return result;
  };

  const resetToDefaults = async () => {
    const freshProfiles = INITIAL_VEHICLE_PROFILES;
    setVehicles(freshProfiles);
    setActiveVehicleNameState('Ford Mustang Mach-E');
    setSelectedYearState('all');
    setUploadedCsvFiles([]);
    await saveVehicles(freshProfiles);
    await saveActiveVehicleName('Ford Mustang Mach-E');
    await saveUploadedCsvFiles([]);
  };

  return (
    <VehicleContext.Provider
      value={{
        vehicles,
        activeVehicleName,
        activeVehicle,
        availableCommands,
        selectedYear,
        setSelectedYear,
        availableYears,
        setActiveVehicleName,
        addCustomCommand,
        deleteCommand,
        uploadedCsvFiles,
        deleteUploadedCsv,
        deleteAllCustomCommands,
        importCSVText,
        resetToDefaults,
      }}
    >
      {initialized ? children : null}
    </VehicleContext.Provider>
  );
};

export function useVehicle(): VehicleContextType {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error('useVehicle must be used within a VehicleProvider');
  }
  return context;
}
