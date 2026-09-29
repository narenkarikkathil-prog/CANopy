import React, { useState, useRef } from 'react';
import { useVehicle } from '../../context/VehicleContext';
import type { CSVValidationError } from '../../services/csvEngine';
import { IconUpload, IconCheck, IconAlertCircle } from '@tabler/icons-react';

export const CsvUploader: React.FC = () => {
  const { importCSVText } = useVehicle();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<CSVValidationError[]>([]);

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
      const result = await importCSVText(text);

      if (result.success) {
        const vehicleCount = Object.keys(result.groupedByVehicle).length;
        setSuccessMsg(
          `Successfully imported ${result.totalRows} command(s) across ${vehicleCount} vehicle profile(s)!`
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

  return (
    <div className="card csv-uploader-card">
      <div className="csv-uploader-header">
        <h3 className="section-title serif-heading">Import Vehicle Commands CSV</h3>
        <p className="section-subtitle">
          Upload custom OBD-II parameter definitions. Required header columns:
          <code className="csv-header-code">VEHICLE_NAME, COMMAND_NAME, HEADER, MODE_PID, FORMULA, UNITS, MIN_VAL, MAX_VAL</code>
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
          <span className="drop-zone-hint">Strict validation — reject whole file on any column error</span>
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
  );
};
