import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { WidgetConfig, WidgetType, GaugeAccent, PrecisionOption } from '../../types/telemetry';
import { GAUGE_ACCENT_COLORS } from '../../types/telemetry';
import { useVehicle } from '../../context/VehicleContext';
import { IconX, IconCheck, IconSearch } from '@tabler/icons-react';
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

  // Search & Filter state for Signal Source
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // Auto-focus search input when opening to add a new widget
  useEffect(() => {
    if (isOpen && !widget) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, widget]);

  // Scroll active item into view on open
  useEffect(() => {
    if (isOpen && selectedItemRef.current && listRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen]);

  const { categories, categoryCounts } = useMemo(() => {
    const set = new Set<string>();
    const counts: Record<string, number> = { All: availableCommands.length };
    for (const c of availableCommands) {
      const cat = c.category || (c.isCustom ? 'Custom Signals' : 'General');
      set.add(cat);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return {
      categories: ['All', ...Array.from(set).sort()],
      categoryCounts: counts,
    };
  }, [availableCommands]);

  const filteredCommands = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const queryTokens = q ? q.split(/\s+/).filter(Boolean) : [];

    return availableCommands.filter((c) => {
      // Category filter
      if (selectedCategory !== 'All') {
        const cat = c.category || (c.isCustom ? 'Custom Signals' : 'General');
        if (cat !== selectedCategory) return false;
      }

      if (queryTokens.length === 0) return true;

      const cleanPid = (c.modePid || '').replace(/\s+/g, '').toLowerCase();
      const rawPid = (c.modePid || '').toLowerCase();
      const name = (c.commandName || '').toLowerCase();
      const units = (c.units || '').toLowerCase();
      const cat = (c.category || (c.isCustom ? 'custom signals' : 'general')).toLowerCase();
      const desc = (c.description || '').toLowerCase();
      const vehicle = (c.vehicleName || '').toLowerCase();

      return queryTokens.every((token) => {
        const cleanToken = token.replace(/\s+/g, '');
        return (
          name.includes(token) ||
          cleanPid.includes(cleanToken) ||
          rawPid.includes(token) ||
          units.includes(token) ||
          cat.includes(token) ||
          desc.includes(token) ||
          vehicle.includes(token)
        );
      });
    });
  }, [availableCommands, searchQuery, selectedCategory]);

  const convertibleUnits = useMemo(() => {
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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      // If there are filtered commands, select the first matching command if not already selected
      if (filteredCommands.length > 0) {
        const isInList = filteredCommands.some((c) => c.id === signalSourceId);
        if (!isInList) {
          handleSourceChange(filteredCommands[0].id);
        }
      }
    } else if (e.key === 'Escape') {
      if (searchQuery) {
        e.preventDefault();
        setSearchQuery('');
      }
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

          {/* Signal Source Search & Selection */}
          <div className="form-group signal-source-picker">
            <div className="form-row-header">
              <label className="form-label" htmlFor="signal-search-input">
                Signal Source
              </label>
            </div>

            {/* Selected Signal Preview Card */}
            {selectedCmd && (
              <div className="signal-selected-card">
                <div className="signal-selected-info">
                  <span className="signal-selected-label">Current Selection</span>
                  <div className="signal-selected-name">{selectedCmd.commandName}</div>
                  <div className="signal-selected-meta">
                    <span className="signal-pid-badge">{selectedCmd.modePid}</span>
                    {selectedCmd.units && (
                      <span className="signal-unit-badge">
                        {unitOverride || selectedCmd.units}
                      </span>
                    )}
                    {selectedCmd.category && (
                      <span className="signal-cat-badge">{selectedCmd.category}</span>
                    )}
                    <span>
                      Range: {scaleMin} to {scaleMax} {unitOverride || selectedCmd.units || ''}
                    </span>
                  </div>
                </div>
                <div className="signal-check-icon" title="Selected" aria-hidden="true">
                  <IconCheck size={14} stroke={3} />
                </div>
              </div>
            )}

            {/* Search Input */}
            <div className="signal-search-wrapper">
              <IconSearch size={16} className="search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                id="signal-search-input"
                type="text"
                className="signal-search-input"
                placeholder="Search signals by name, PID (e.g. 010C), or unit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                autoComplete="off"
                aria-label="Search available data signals"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="signal-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  <IconX size={14} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            {categories.length > 2 && (
              <div className="signal-category-pills" role="tablist" aria-label="Signal Categories">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                    role="tab"
                    aria-selected={selectedCategory === cat}
                  >
                    {cat} {categoryCounts[cat] !== undefined ? `(${categoryCounts[cat]})` : ''}
                  </button>
                ))}
              </div>
            )}

            {/* Results Status / Count */}
            <div className="signal-results-bar">
              <span>
                {filteredCommands.length === availableCommands.length
                  ? `All ${availableCommands.length} signals`
                  : `Showing ${filteredCommands.length} of ${availableCommands.length} signals`}
              </span>
              {searchQuery && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ fontSize: '11px', padding: '2px 6px', textDecoration: 'underline' }}
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Interactive Signals List */}
            <div
              ref={listRef}
              className="signal-options-list"
              role="listbox"
              aria-label="Select a signal source"
            >
              {filteredCommands.length > 0 ? (
                filteredCommands.map((c) => {
                  const isSelected = c.id === signalSourceId;
                  return (
                    <div
                      key={c.id}
                      ref={isSelected ? selectedItemRef : undefined}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      className={`signal-option-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSourceChange(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSourceChange(c.id);
                        }
                      }}
                    >
                      <div className="signal-option-main">
                        <div className="signal-option-name">{c.commandName}</div>
                        <div className="signal-option-badges">
                          <span className="signal-pid-badge">{c.modePid}</span>
                          {c.units && <span className="signal-unit-badge">{c.units}</span>}
                          {c.category && (
                            <span className="signal-cat-badge">{c.category}</span>
                          )}
                        </div>
                      </div>
                      <div className="signal-option-aside">
                        <span className="signal-option-range">
                          {c.minVal} – {c.maxVal} {c.units || ''}
                        </span>
                        {isSelected && (
                          <div className="signal-check-icon" aria-hidden="true">
                            <IconCheck size={14} stroke={3} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="signal-options-empty">
                  <IconSearch size={22} className="signal-empty-icon" />
                  <p className="signal-empty-text">
                    No signals matched "<strong>{searchQuery}</strong>"
                  </p>
                  <p className="signal-empty-subtext">
                    Try searching for terms like "RPM", "Speed", "Coolant", or PID "010C"
                  </p>
                  <button
                    type="button"
                    className="btn-ghost signal-clear-btn"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('All');
                    }}
                  >
                    Clear search filters
                  </button>
                </div>
              )}
            </div>
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
