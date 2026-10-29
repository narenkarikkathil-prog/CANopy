import React from 'react';
import { useBLE } from '../../context/BLEContext';
import { formatRecordingDuration } from '../../services/telemetryRecorder';
import {
  IconPlayerRecord,
  IconPlayerStop,
  IconDownload,
  IconTrash,
  IconCheck,
  IconFileSpreadsheet,
} from '@tabler/icons-react';

export const TelemetryRecordingBar: React.FC = () => {
  const {
    isRecording,
    recordingDuration,
    recordedSamplesCount,
    recordedChannelsCount,
    startRecording,
    stopRecording,
    deleteRecording,
    startNewRecording,
    exportRecordingCSV,
  } = useBLE();

  // State 1: Actively Recording
  if (isRecording) {
    return (
      <div className="telemetry-recording-bar card recording-active" role="region" aria-label="Live Telemetry Recording">
        <div className="recording-bar-left">
          <div className="recording-status-badge recording">
            <span className="recording-live-pulse-dot" />
            <span>REC</span>
          </div>
          <div className="recording-time-display serif-heading">
            {formatRecordingDuration(recordingDuration)}
          </div>
          <div className="recording-stats-text">
            <strong>{recordedSamplesCount}</strong> samples logged across{' '}
            <strong>{recordedChannelsCount}</strong> {recordedChannelsCount === 1 ? 'channel' : 'channels'}
          </div>
        </div>

        <div className="recording-bar-actions">
          <button
            type="button"
            className="btn-secondary btn-recording-stop"
            onClick={stopRecording}
            aria-label="Stop recording telemetry"
          >
            <IconPlayerStop size={16} fill="currentColor" />
            <span>Stop Recording</span>
          </button>
          <button
            type="button"
            className="btn-ghost btn-recording-discard"
            onClick={deleteRecording}
            title="Discard this recording without saving"
            aria-label="Discard recording"
          >
            <IconTrash size={16} />
            <span>Discard</span>
          </button>
        </div>
      </div>
    );
  }

  // State 2: Stopped with recorded data available
  if (recordedSamplesCount > 0) {
    return (
      <div className="telemetry-recording-bar card recording-complete" role="region" aria-label="Recorded Telemetry Session">
        <div className="recording-bar-left">
          <div className="recording-status-badge complete">
            <IconCheck size={14} stroke={3} />
            <span>LOGGED</span>
          </div>
          <div className="recording-time-display serif-heading">
            {formatRecordingDuration(recordingDuration)}
          </div>
          <div className="recording-stats-text">
            <strong>{recordedSamplesCount}</strong> samples recorded with timestamps & ready for export.
          </div>
        </div>

        <div className="recording-bar-actions">
          <button
            type="button"
            className="btn-primary btn-recording-export"
            onClick={exportRecordingCSV}
            aria-label="Export recorded telemetry as CSV file"
          >
            <IconDownload size={16} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            className="btn-secondary btn-recording-new"
            onClick={startNewRecording}
            title="Discard this session and start a brand new recording"
            aria-label="Start new recording"
          >
            <IconPlayerRecord size={16} />
            <span>New Recording</span>
          </button>
          <button
            type="button"
            className="btn-ghost btn-recording-delete"
            onClick={deleteRecording}
            title="Delete this recording"
            aria-label="Delete recording"
          >
            <IconTrash size={16} />
            <span>Delete</span>
          </button>
        </div>
      </div>
    );
  }

  // State 3: Idle (Ready to record)
  return (
    <div className="telemetry-recording-bar card recording-idle" role="region" aria-label="Telemetry Logger">
      <div className="recording-bar-left">
        <div className="recording-idle-icon-badge">
          <IconFileSpreadsheet size={18} />
        </div>
        <div className="recording-idle-info">
          <span className="recording-idle-title">Telemetry Data Logger</span>
          <span className="recording-idle-subtitle">
            Log live sensor streams with millisecond timestamps and export to CSV.
          </span>
        </div>
      </div>

      <div className="recording-bar-actions">
        <button
          type="button"
          className="btn-primary btn-recording-start"
          onClick={startRecording}
          aria-label="Start recording telemetry"
        >
          <span className="rec-record-red-dot" />
          <span>Start Recording</span>
        </button>
      </div>
    </div>
  );
};
