import React from 'react';
import type { WidgetConfig, OBDCommand } from '../../../types/telemetry';
import { GAUGE_ACCENT_COLORS } from '../../../types/telemetry';
import { resolveDisplayValueAndUnit, convertTelemetryValue } from '../../../services/widgetResolver';

interface GaugeWidgetProps {
  widget: WidgetConfig;
  command?: OBDCommand;
  value: number | null;
}

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({ widget, command, value }) => {
  const { displayVal, formatted: formattedValue, unit: displayUnit } =
    resolveDisplayValueAndUnit(value, widget, command?.units);

  const rawMin = command?.minVal ?? 0;
  const rawMax = command?.maxVal ?? 100;
  const convertedMin = convertTelemetryValue(rawMin, command?.units, widget.unitOverride).value ?? rawMin;
  const convertedMax = convertTelemetryValue(rawMax, command?.units, widget.unitOverride).value ?? rawMax;
  const min = widget.scaleMin !== undefined ? widget.scaleMin : Math.round(convertedMin);
  const max = widget.scaleMax !== undefined ? widget.scaleMax : Math.round(convertedMax);

  const clampedVal =
    displayVal !== null ? Math.min(Math.max(displayVal, min), max) : min;

  // Real warnings only (e.g. overheating or redline)
  const isWarning =
    displayVal !== null && max > min && (clampedVal - min) / (max - min) > 0.9;

  // Arc calculations:
  // Center: (100, 105), Radius: 72
  // Arc from 180 deg (left, x=28, y=105) to 0 deg (right, x=172, y=105)
  // Total arc length = PI * 72 ≈ 226.19
  const radius = 72;
  const arcLength = Math.PI * radius;
  const ratio = max > min ? (clampedVal - min) / (max - min) : 0;
  const strokeOffset = arcLength * (1 - Math.max(0, Math.min(1, ratio)));

  const accent = GAUGE_ACCENT_COLORS[widget.accentColor || 'neon-green'] || GAUGE_ACCENT_COLORS['neon-green'];
  const accentHex = accent.hex;
  const gradId = `gaugeGrad_${widget.id}`;

  return (
    <div className="gauge-widget-container" style={{ '--widget-accent': accentHex } as React.CSSProperties}>
      {/* Metric Label (Serif with accent dot) */}
      <div className="gauge-header">
        <div className="metric-label-with-accent">
          <span className="accent-indicator-dot" style={{ backgroundColor: accentHex }} />
          <span className="widget-metric-label">{command?.commandName || 'Telemetry'}</span>
        </div>
      </div>

      <div className="gauge-svg-wrapper">
        <svg viewBox="0 0 200 120" className="gauge-svg" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={accentHex} stopOpacity="0.45" />
              <stop offset="100%" stopColor={isWarning ? 'var(--error)' : accentHex} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Empty Track Arc */}
          <path
            d="M 28 105 A 72 72 0 0 1 172 105"
            fill="none"
            stroke="var(--track)"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* Active Value Arc with subtle tan gradient */}
          <path
            d="M 28 105 A 72 72 0 0 1 172 105"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeOffset}
            style={{
              transition: 'stroke-dashoffset 0.25s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.2s ease',
            }}
          />

          {/* Tiny, faint Min and Max labels */}
          <text x="28" y="118" textAnchor="middle" className="gauge-faint-tick tabular-nums">
            {min}
          </text>
          <text x="172" y="118" textAnchor="middle" className="gauge-faint-tick tabular-nums">
            {max}
          </text>
        </svg>

        {/* Center Primary Value — Visual Focus */}
        <div className="gauge-center-readout">
          <div className="metric-value-row">
            <span className="metric-large-value tabular-nums">{formattedValue}</span>
            {displayUnit && (
              <span className="metric-unit-text">{displayUnit}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
