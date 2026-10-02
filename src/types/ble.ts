export type BLEConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type ConnectionMode = 'ble' | 'classic' | 'usb';

export type ConnectionType = 'ble' | 'classic' | 'usb' | 'serial' | 'simulated';

export type ATLogDirection = 'tx' | 'rx' | 'info' | 'error';

export interface ATLogEntry {
  id: string;
  timestamp: string;
  direction: ATLogDirection;
  text: string;
}

export interface BLEDeviceInfo {
  id?: string;
  name?: string;
  connected: boolean;
  type?: ConnectionType;
}

