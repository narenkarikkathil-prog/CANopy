import React, { useState } from 'react';
import type { WidgetConfig, WidgetType, GaugeAccent } from '../../types/telemetry';
import { GAUGE_ACCENT_COLORS } from '../../types/telemetry';
import { useVehicle } from '../../context/VehicleContext';
import { IconX, IconCheck } from '@tabler/icons-react';

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

  const [type, setType] = useState<WidgetType>(widget?.type || 'gauge');
  const [signalSourceId, setSignalSourceId] = useState<string>(
    widget?.signalSourceId || availableCommands[0]?.id || ''
  );

  // Gauge state
  const selectedCmd = availableCommands.find((c) => c.id === signalSourceId);
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

  if (!isOpen) return null;

  const handleSourceChange = (newSourceId: string) => {
    setSignalSourceId(newSourceId);
    const cmd = availableCommands.find((c) => c.id === newSourceId);
    if (cmd) {
      setScaleMin(cmd.minVal);
      setScaleMax(cmd.maxVal);
      setYAxisMin(cmd.minVal);
      setYAxisMax(cmd.maxVal);
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

              {/* 5-Swatch Accent Picker */}
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
