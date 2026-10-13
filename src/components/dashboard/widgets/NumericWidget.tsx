import React from 'react';
import type { WidgetConfig, OBDCommand } from '../../../types/telemetry';
import { GAUGE_ACCENT_COLORS } from '../../../types/telemetry';
import { resolveDisplayValueAndUnit } from '../../../services/widgetResolver';

interface NumericWidgetProps {
  widget: WidgetConfig;
  command?: OBDCommand;
  value: number | null;
}

export const NumericWidget: React.FC<NumericWidgetProps> = ({ widget, command, value }) => {
  const { displayVal, formatted: formattedVal, unit: displayUnit } =
    resolveDisplayValueAndUnit(value, widget, command?.units);

  // Real warnings only (e.g. coolant overheating > 105°C or > 221°F)
  const isOverheatingThreshold = displayUnit?.toLowerCase().includes('f') ? 221 : 105;
  const isOverheating =
    displayVal !== null &&
    (command?.modePid === '0105' || command?.commandName.toLowerCase().includes('coolant')) &&
    displayVal >= isOverheatingThreshold;

  const accent = GAUGE_ACCENT_COLORS[widget.accentColor || 'amber'] || GAUGE_ACCENT_COLORS['amber'];
  const accentHex = accent.hex;

  return (
    <div className="numeric-widget-container" style={{ '--widget-accent': accentHex } as React.CSSProperties}>
      <div className="numeric-header">
        <div className="metric-label-with-accent">
          <span className="accent-indicator-dot" style={{ backgroundColor: accentHex }} />
          <span className="widget-metric-label">{command?.commandName || 'Coolant Temp'}</span>
        </div>
      </div>

      <div className="metric-value-row">
        <span
          className={`metric-large-value tabular-nums ${isOverheating ? 'metric-warning' : ''}`}
        >
          {formattedVal}
        </span>
        {displayUnit && (
          <span className="metric-unit-text">{displayUnit}</span>
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
