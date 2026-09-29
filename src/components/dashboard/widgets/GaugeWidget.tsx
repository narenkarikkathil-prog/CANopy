import React from 'react';
import type { WidgetConfig, OBDCommand } from '../../../types/telemetry';

interface GaugeWidgetProps {
  widget: WidgetConfig;
  command?: OBDCommand;
  value: number | null;
}

export const GaugeWidget: React.FC<GaugeWidgetProps> = ({ widget, command, value }) => {
  const min = widget.scaleMin !== undefined ? widget.scaleMin : command?.minVal ?? 0;
  const max = widget.scaleMax !== undefined ? widget.scaleMax : command?.maxVal ?? 100;

  const displayVal = value !== null ? value : null;
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

  // Format numerical value nicely
  const formattedValue =
    displayVal !== null
      ? displayVal >= 1000
        ? Math.round(displayVal).toLocaleString()
        : Math.abs(displayVal) < 10 && displayVal % 1 !== 0
        ? displayVal.toFixed(1)
        : Math.round(displayVal).toString()
      : '—';

  const gradId = `gaugeGrad_${widget.id}`;

  return (
    <div className="gauge-widget-container">
      {/* Metric Label (Serif) */}
      <div className="gauge-header">
        <span className="widget-metric-label">{command?.commandName || 'Engine RPM'}</span>
      </div>

      <div className="gauge-svg-wrapper">
        <svg viewBox="0 0 200 120" className="gauge-svg" aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#CDB494" />
              <stop offset="100%" stopColor={isWarning ? 'var(--error)' : '#BC9A70'} />
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
            {command?.units && (
              <span className="metric-unit-text">{command.units}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
