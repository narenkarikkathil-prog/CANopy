import React from 'react';
import type { WidgetConfig, OBDCommand } from '../../../types/telemetry';

interface NumericWidgetProps {
  widget: WidgetConfig;
  command?: OBDCommand;
  value: number | null;
}

export const NumericWidget: React.FC<NumericWidgetProps> = ({ command, value }) => {
  const displayVal = value !== null ? value : null;

  // Real warnings only (e.g. coolant overheating > 105°C)
  const isOverheating =
    displayVal !== null &&
    (command?.modePid === '0105' || command?.commandName.toLowerCase().includes('coolant')) &&
    displayVal >= 105;

  const formattedVal =
    displayVal !== null
      ? displayVal >= 1000
        ? Math.round(displayVal).toLocaleString()
        : Math.abs(displayVal) < 10 && displayVal % 1 !== 0
        ? displayVal.toFixed(1)
        : Math.round(displayVal).toString()
      : '—';

  return (
    <div className="numeric-widget-container">
      <div className="numeric-header">
        <span className="widget-metric-label">{command?.commandName || 'Coolant Temp'}</span>
      </div>

      <div className="metric-value-row">
        <span
          className={`metric-large-value tabular-nums ${isOverheating ? 'metric-warning' : ''}`}
        >
          {formattedVal}
        </span>
        {command?.units && (
          <span className="metric-unit-text">{command.units}</span>
        )}
      </div>

      {isOverheating && (
        <div className="warning-notice">
          <span className="warning-dot" />
          <span>High Temperature Warning</span>
        </div>
      )}
    </div>
  );
};
