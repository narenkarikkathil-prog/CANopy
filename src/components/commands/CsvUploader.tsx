import React, { useState, useRef } from 'react';
import { useVehicle } from '../../context/VehicleContext';
import type { CSVValidationError } from '../../services/csvEngine';
import {
  IconUpload,
  IconCheck,
  IconAlertCircle,
  IconFileSpreadsheet,
  IconTrash,
  IconCar,
  IconCalendar,
  IconAlertTriangle,
} from '@tabler/icons-react';

export const CsvUploader: React.FC = () => {
  const { importCSVText, uploadedCsvFiles, deleteUploadedCsv } = useVehicle();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<CSVValidationError[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrors([{ row: 0, message: 'Invalid file format. Only .csv files are accepted.' }]);
      setSuccessMsg(null);
      return;
    }

    setLoading(true);
    setErrors([]);
    setSuccessMsg(null);

    try {
      const text = await file.text();
      const result = await importCSVText(text, file.name);

      if (result.success) {
        const vehicleCount = Object.keys(result.groupedByVehicle).length;
        setSuccessMsg(
          `Successfully imported "${file.name}" with ${result.totalRows} command(s) across ${vehicleCount} vehicle profile(s)!`
        );
      } else {
        setErrors(result.errors);
      }
    } catch (err: any) {
      setErrors([{ row: 0, message: `Failed to read file: ${err.message}` }]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDeleteFile = async (fileId: string, fileName: string, count: number) => {
    try {
      await deleteUploadedCsv(fileId);
      setConfirmDeleteId(null);
      setSuccessMsg(`Deleted "${fileName}" and removed its ${count} imported command(s).`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(`Error deleting CSV file: ${err.message}`);
    }
  };

  return (
    <div className="csv-manager-container">
      {/* Upload Card */}
      <div className="card csv-uploader-card">
        <div className="csv-uploader-header">
          <h3 className="section-title serif-heading">Import Vehicle Commands CSV</h3>
          <p className="section-subtitle">
            Upload custom OBD-II parameter definitions. Required header columns:
            <code className="csv-header-code">
              VEHICLE_NAME, COMMAND_NAME, HEADER, MODE_PID, FORMULA, UNITS, MIN_VAL, MAX_VAL
            </code>
          </p>
        </div>

        <div
          className={`csv-drop-zone ${dragActive ? 'drag-active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden-file-input"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="drop-zone-content">
            <div className="drop-zone-icon">
              <IconUpload size={32} stroke={1.7} />
            </div>
            <p className="drop-zone-text">
              {loading ? 'Validating CSV...' : 'Click to select or drag and drop a .csv file'}
            </p>
            <span className="drop-zone-hint">
              Strict validation — reject whole file on any column error
            </span>
          </div>
        </div>

        {/* Success Notification */}
        {successMsg && (
          <div className="csv-alert csv-success">
            <IconCheck size={20} className="alert-icon" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Reporting List */}
        {errors.length > 0 && (
          <div className="csv-alert csv-error-box">
            <div className="csv-error-header">
              <IconAlertCircle size={20} className="alert-icon" />
              <strong>CSV Rejected ({errors.length} validation error{errors.length > 1 ? 's' : ''}):</strong>
            </div>
            <ul className="csv-error-list">
              {errors.map((err, i) => (
                <li key={i}>
                  {err.row > 0 && <span className="error-row-tag">Row {err.row}: </span>}
                  {err.column && <span className="error-col-tag">[{err.column}] </span>}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Uploaded CSV Files Management Section */}
      <div className="card uploaded-files-card">
        <div className="uploaded-files-header">
          <div className="header-title-group">
            <IconFileSpreadsheet size={22} className="card-header-icon" />
            <h3 className="section-title serif-heading">Uploaded CSV Files</h3>
            <span className="badge-pill command-count-badge">
              {uploadedCsvFiles.length} file{uploadedCsvFiles.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="section-subtitle">
            Manage or completely delete whole CSV files you have uploaded. Deleting a file removes all its associated commands.
          </p>
        </div>

        {uploadedCsvFiles.length === 0 ? (
          <div className="empty-files-state">
            <IconFileSpreadsheet size={36} stroke={1.5} className="empty-files-icon" />
            <p className="empty-files-title">No CSV files uploaded yet</p>
            <p className="empty-files-subtitle">
              When you upload a .csv file above, it will be cataloged here with a quick option to delete the whole file and all of its signals.
            </p>
          </div>
        ) : (
          <div className="uploaded-files-list">
            {uploadedCsvFiles.map((file) => {
              const isConfirming = confirmDeleteId === file.id;
              const formattedDate = new Date(file.uploadedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={file.id} className="uploaded-file-row">
                  <div className="file-info-group">
                    <div className="file-icon-box">
                      <IconFileSpreadsheet size={24} />
                    </div>
                    <div className="file-details">
                      <div className="file-name-row">
                        <strong className="file-name">{file.fileName}</strong>
                        <span className="badge-pill signal-count-badge">
                          {file.commandCount} command{file.commandCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="file-meta-row">
                        <span className="file-meta-item">
                          <IconCalendar size={13} />
                          {formattedDate}
                        </span>
                        <span className="file-meta-divider">•</span>
                        <span className="file-meta-item">
                          <IconCar size={13} />
                          {file.vehicleNames.join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="file-actions">
                    {isConfirming ? (
                      <div className="confirm-delete-group">
                        <span className="confirm-prompt">
                          <IconAlertTriangle size={15} />
                          Delete whole file & its {file.commandCount} commands?
                        </span>
                        <div className="confirm-buttons">
                          <button
                            type="button"
                            className="btn-danger-confirm"
                            onClick={() => handleDeleteFile(file.id, file.fileName, file.commandCount)}
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-delete-file"
                        onClick={() => setConfirmDeleteId(file.id)}
                        title={`Delete ${file.fileName} and all its commands`}
                      >
                        <IconTrash size={15} />
                        <span>Delete File</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
