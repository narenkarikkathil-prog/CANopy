import React, { useState } from 'react';
import type { WidgetConfig, WidgetType, GaugeAccent, PrecisionOption } from '../../types/telemetry';
import { GAUGE_ACCENT_COLORS } from '../../types/telemetry';
import { useVehicle } from '../../context/VehicleContext';
import { IconX, IconCheck } from '@tabler/icons-react';
import {
  findCommandForWidget,
  getConvertibleUnitOptions,
  convertTelemetryValue,
} from '../../services/widgetResolver';

interface WidgetConfigModalProps {
  widget?: WidgetConfig | null; // null if adding new
  slotIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: Omit<WidgetConfig, 'id'>) => void;
}

export const WidgetConfigModal: React.FC<WidgetConfigModalProps> = ({
  widget,
  slotIndex,
  isOpen,
  onClose,
  onSave,
}) => {
  const { availableCommands } = useVehicle();

  const resolvedInitialCmd = findCommandForWidget(widget, availableCommands, slotIndex);

  const [type, setType] = useState<WidgetType>(widget?.type || 'gauge');
  const [signalSourceId, setSignalSourceId] = useState<string>(
    resolvedInitialCmd?.id || widget?.signalSourceId || availableCommands[0]?.id || ''
  );

  // Precision and Unit options
  const [precision, setPrecision] = useState<PrecisionOption>(widget?.precision || 'auto');
  const [unitOverride, setUnitOverride] = useState<string>(widget?.unitOverride || '');

  // Gauge state
  const selectedCmd =
    availableCommands.find((c) => c.id === signalSourceId) || resolvedInitialCmd;
  const [scaleMin, setScaleMin] = useState<number>(
    widget?.scaleMin ?? selectedCmd?.minVal ?? 0
  );
  const [scaleMax, setScaleMax] = useState<number>(
    widget?.scaleMax ?? selectedCmd?.maxVal ?? 100
  );
  const [accentColor, setAccentColor] = useState<GaugeAccent>(
    widget?.accentColor || 'neon-green'
  );

  // Line graph state
  const [scalingMode, setScalingMode] = useState<'auto' | 'manual'>(
    widget?.scalingMode || 'auto'
  );
  const [xAxisWindow, setXAxisWindow] = useState<number>(widget?.xAxisWindow || 30);
  const [yAxisMin, setYAxisMin] = useState<number>(
    widget?.yAxisMin ?? selectedCmd?.minVal ?? 0
  );
  const [yAxisMax, setYAxisMax] = useState<number>(
    widget?.yAxisMax ?? selectedCmd?.maxVal ?? 100
  );

  const categories = React.useMemo(() => {
    const map = new Map<string, typeof availableCommands>();
    for (const c of availableCommands) {
      const cat = c.category || (c.isCustom ? 'Custom Signals' : 'General');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    return map;
  }, [availableCommands]);

  const convertibleUnits = React.useMemo(() => {
    return getConvertibleUnitOptions(selectedCmd?.units);
  }, [selectedCmd?.units]);

  if (!isOpen) return null;

  const handleSourceChange = (newSourceId: string) => {
    setSignalSourceId(newSourceId);
    setUnitOverride(''); // Reset unit conversion when changing metric
    const cmd = availableCommands.find((c) => c.id === newSourceId);
    if (cmd) {
      setScaleMin(cmd.minVal);
      setScaleMax(cmd.maxVal);
      setYAxisMin(cmd.minVal);
      setYAxisMax(cmd.maxVal);
    }
  };

  const handleUnitChange = (newUnit: string) => {
    setUnitOverride(newUnit);
    if (selectedCmd) {
      const cMin = convertTelemetryValue(selectedCmd.minVal, selectedCmd.units, newUnit).value;
      const cMax = convertTelemetryValue(selectedCmd.maxVal, selectedCmd.units, newUnit).value;
      if (cMin !== null) setScaleMin(Math.round(cMin));
      if (cMax !== null) setScaleMax(Math.round(cMax));
      if (cMin !== null) setYAxisMin(Math.round(cMin));
      if (cMax !== null) setYAxisMax(Math.round(cMax));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      slotIndex: widget ? widget.slotIndex : slotIndex,
      type,
      signalSourceId,
      scaleMin,
      scaleMax,
      accentColor,
      scalingMode,
      xAxisWindow,
      yAxisMin,
      yAxisMax,
      precision,
      unitOverride: unitOverride || undefined,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content card">
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title serif-heading">
            {widget ? 'Edit Widget' : `Configure Widget (Slot ${slotIndex + 1})`}
          </h2>
          <button type="button" className="btn-ghost icon-button" onClick={onClose} aria-label="Close">
            <IconX size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Display Mode Segmented Control */}
          <div className="form-group">
            <label className="form-label">Display Mode</label>
            <div className="segmented-control mode-selector">
              <button
                type="button"
                className={type === 'gauge' ? 'active' : ''}
                onClick={() => setType('gauge')}
              >
                Gauge
              </button>
              <button
                type="button"
                className={type === 'lineGraph' ? 'active' : ''}
                onClick={() => setType('lineGraph')}
              >
                Line Graph
              </button>
              <button
                type="button"
                className={type === 'numeric' ? 'active' : ''}
                onClick={() => setType('numeric')}
              >
                Numeric
              </button>
            </div>
          </div>

          {/* Signal Source Dropdown */}
          <div className="form-group">
            <label className="form-label" htmlFor="signal-source-select">
              Signal Source
            </label>
            <select
              id="signal-source-select"
              value={signalSourceId}
              onChange={(e) => handleSourceChange(e.target.value)}
              required
            >
              {Array.from(categories.entries()).map(([catName, cmds]) => (
                <optgroup key={catName} label={catName}>
                  {cmds.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.commandName} ({c.modePid}) {c.units ? `— ${c.units}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Unit of Measure Conversion Toggle (e.g. km/h vs mph, °C vs °F, psi vs bar vs kPa) */}
          {convertibleUnits && convertibleUnits.length > 1 && (
            <div className="form-group">
              <label className="form-label">Unit of Measure</label>
              <div className="segmented-control">
                {convertibleUnits.map((u) => {
                  const isSelected = (unitOverride || selectedCmd?.units) === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      className={isSelected ? 'active' : ''}
                      onClick={() => handleUnitChange(u)}
                    >
                      {u}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mode Specific Settings: GAUGE */}
          {type === 'gauge' && (
            <div className="mode-specific-fields">
              <div className="form-row">
                <div className="form-group col-half">
                  <label className="form-label">Scale Min</label>
                  <input
                    type="number"
                    value={scaleMin}
                    onChange={(e) => setScaleMin(parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>
                <div className="form-group col-half">
                  <label className="form-label">Scale Max</label>
                  <input
                    type="number"
                    value={scaleMax}
                    onChange={(e) => setScaleMax(parseFloat(e.target.value) || 100)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode Specific Settings: LINE GRAPH */}
          {type === 'lineGraph' && (
            <div className="mode-specific-fields">
              <div className="form-group">
                <label className="form-label">Scaling Mode</label>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={scalingMode === 'auto' ? 'active' : ''}
                    onClick={() => setScalingMode('auto')}
                  >
                    Auto Continuous
                  </button>
                  <button
                    type="button"
                    className={scalingMode === 'manual' ? 'active' : ''}
                    onClick={() => setScalingMode('manual')}
                  >
                    Manual Fixed
                  </button>
                </div>
              </div>

              {scalingMode === 'manual' && (
                <>
                  <div className="form-group">
                    <label className="form-label">X-Axis Window</label>
                    <div className="segmented-control">
                      <button
                        type="button"
                        className={xAxisWindow === 30 ? 'active' : ''}
                        onClick={() => setXAxisWindow(30)}
                      >
                        30s
                      </button>
                      <button
                        type="button"
                        className={xAxisWindow === 60 ? 'active' : ''}
                        onClick={() => setXAxisWindow(60)}
                      >
                        60s
                      </button>
                      <button
                        type="button"
                        className={xAxisWindow === 120 ? 'active' : ''}
                        onClick={() => setXAxisWindow(120)}
                      >
                        120s
                      </button>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group col-half">
                      <label className="form-label">Y-Axis Min</label>
                      <input
                        type="number"
                        value={yAxisMin}
                        onChange={(e) => setYAxisMin(parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="form-group col-half">
                      <label className="form-label">Y-Axis Max</label>
                      <input
                        type="number"
                        value={yAxisMax}
                        onChange={(e) => setYAxisMax(parseFloat(e.target.value) || 100)}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Significant Figures & Precision */}
          <div className="form-group">
            <label className="form-label" htmlFor="precision-select">
              Significant Figures & Precision
            </label>
            <select
              id="precision-select"
              value={precision}
              onChange={(e) => setPrecision(e.target.value as PrecisionOption)}
            >
              <option value="auto">Auto (Default formatting)</option>
              <option value="sig2">2 Significant Figures (e.g. 14, 1.4, 0.14)</option>
              <option value="sig3">3 Significant Figures (e.g. 143, 14.3, 1.43)</option>
              <option value="sig4">4 Significant Figures (e.g. 1432, 143.2, 14.32)</option>
              <option value="dec0">0 Decimals (Integer, e.g. 14)</option>
              <option value="dec1">1 Decimal Place (e.g. 14.3)</option>
              <option value="dec2">2 Decimal Places (e.g. 14.32)</option>
              <option value="dec3">3 Decimal Places (e.g. 14.325)</option>
            </select>
          </div>

          {/* 5-Swatch Accent Color Picker (Universal for all widget types) */}
          <div className="form-group">
            <label className="form-label">Accent Color</label>
            <div className="swatch-picker">
              {(Object.keys(GAUGE_ACCENT_COLORS) as GaugeAccent[]).map((key) => {
                const swatch = GAUGE_ACCENT_COLORS[key];
                const isSelected = accentColor === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`swatch-button ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: swatch.hex }}
                    onClick={() => setAccentColor(key)}
                    title={swatch.name}
                    aria-label={`Select ${swatch.name} accent`}
                  >
                    {isSelected && <IconCheck size={16} stroke={3} color="#2A2A24" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {widget ? 'Update Widget' : 'Add Widget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
