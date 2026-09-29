export type BLEConnectionStatus = 'disconnected' | 'connecting' | 'connected';

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
}
