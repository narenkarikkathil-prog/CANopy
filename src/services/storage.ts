import { openDB, type IDBPDatabase } from 'idb';
import type { VehicleProfile, WidgetConfig, UploadedCsvFile } from '../types/telemetry';

const DB_NAME = 'canopy_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;
let useLocalStorageFallback = false;

function isIndexedDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

async function getDB(): Promise<IDBPDatabase | null> {
  if (!isIndexedDBAvailable() || useLocalStorageFallback) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('vehicles')) {
          db.createObjectStore('vehicles', { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains('widgets')) {
          db.createObjectStore('widgets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('csvFiles')) {
          db.createObjectStore('csvFiles', { keyPath: 'id' });
        }
      },
    }).catch((err) => {
      console.warn('IndexedDB initialization failed, falling back to localStorage:', err);
      useLocalStorageFallback = true;
      return null as any;
    });
  }

  return dbPromise;
}

// LocalStorage helpers
function lsGet<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(`canopy_${key}`);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function lsSet(key: string, value: any): void {
  try {
    localStorage.setItem(`canopy_${key}`, JSON.stringify(value));
  } catch (err) {
    console.warn(`localStorage setItem failed for ${key}:`, err);
  }
}

/* Vehicle Profiles Storage */
export async function loadVehicles(): Promise<VehicleProfile[]> {
  try {
    const db = await getDB();
    if (db) {
      const records = await db.getAll('vehicles');
      if (records && records.length > 0) return records;
    }
  } catch (err) {
    console.warn('Failed to load vehicles from IndexedDB:', err);
  }
  return lsGet<VehicleProfile[]>('vehicles', []);
}

export async function saveVehicles(vehicles: VehicleProfile[]): Promise<void> {
  // Always update localStorage as backup
  lsSet('vehicles', vehicles);
  try {
    const db = await getDB();
    if (db) {
      const tx = db.transaction('vehicles', 'readwrite');
      await tx.objectStore('vehicles').clear();
      for (const v of vehicles) {
        await tx.objectStore('vehicles').put(v);
      }
      await tx.done;
    }
  } catch (err) {
    console.warn('Failed to save vehicles to IndexedDB:', err);
  }
}

export async function saveVehicle(vehicle: VehicleProfile): Promise<void> {
  const current = await loadVehicles();
  const index = current.findIndex((v) => v.name === vehicle.name);
  if (index >= 0) {
    current[index] = vehicle;
  } else {
    current.push(vehicle);
  }
  await saveVehicles(current);
}

/* Active Vehicle Name */
export async function loadActiveVehicleName(): Promise<string | null> {
  try {
    const db = await getDB();
    if (db) {
      const val = await db.get('settings', 'activeVehicle');
      if (val) return val;
    }
  } catch (err) {
    console.warn('Failed to load active vehicle from IndexedDB:', err);
  }
  return lsGet<string | null>('activeVehicle', null);
}

export async function saveActiveVehicleName(name: string): Promise<void> {
  lsSet('activeVehicle', name);
  try {
    const db = await getDB();
    if (db) {
      await db.put('settings', name, 'activeVehicle');
    }
  } catch (err) {
    console.warn('Failed to save active vehicle to IndexedDB:', err);
  }
}

/* Widget Configurations */
export async function loadWidgets(): Promise<WidgetConfig[]> {
  try {
    const db = await getDB();
    if (db) {
      const widgets = await db.getAll('widgets');
      if (widgets && widgets.length > 0) return widgets;
    }
  } catch (err) {
    console.warn('Failed to load widgets from IndexedDB:', err);
  }
  return lsGet<WidgetConfig[]>('widgets', []);
}

export async function saveWidgets(widgets: WidgetConfig[]): Promise<void> {
  lsSet('widgets', widgets);
  try {
    const db = await getDB();
    if (db) {
      const tx = db.transaction('widgets', 'readwrite');
      await tx.objectStore('widgets').clear();
      for (const w of widgets) {
        await tx.objectStore('widgets').put(w);
      }
      await tx.done;
    }
  } catch (err) {
    console.warn('Failed to save widgets to IndexedDB:', err);
  }
}

/* Uploaded CSV Files Storage */
export async function loadUploadedCsvFiles(): Promise<UploadedCsvFile[]> {
  try {
    const db = await getDB();
    if (db && db.objectStoreNames.contains('csvFiles')) {
      const files = await db.getAll('csvFiles');
      if (files && files.length > 0) return files;
    }
  } catch (err) {
    console.warn('Failed to load csvFiles from IndexedDB:', err);
  }
  return lsGet<UploadedCsvFile[]>('uploaded_csv_files', []);
}

export async function saveUploadedCsvFiles(files: UploadedCsvFile[]): Promise<void> {
  lsSet('uploaded_csv_files', files);
  try {
    const db = await getDB();
    if (db && db.objectStoreNames.contains('csvFiles')) {
      const tx = db.transaction('csvFiles', 'readwrite');
      await tx.objectStore('csvFiles').clear();
      for (const f of files) {
        await tx.objectStore('csvFiles').put(f);
      }
      await tx.done;
    }
  } catch (err) {
    console.warn('Failed to save csvFiles to IndexedDB:', err);
  }
}

