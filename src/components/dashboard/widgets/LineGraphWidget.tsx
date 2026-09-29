import React, { useMemo } from 'react';
import type { WidgetConfig, OBDCommand, TelemetryPoint } from '../../../types/telemetry';

interface LineGraphWidgetProps {
  widget: WidgetConfig;
  command?: OBDCommand;
  value: number | null;
  history?: TelemetryPoint[];
}

export const LineGraphWidget: React.FC<LineGraphWidgetProps> = ({
  widget,
  command,
  value,
  history = [],
}) => {
  const isAuto = widget.scalingMode !== 'manual';
  const timeWindowSec = widget.xAxisWindow || 30; // default 30 seconds

  // Filter history to time window
  const visiblePoints = useMemo(() => {
    if (!history || history.length === 0) return [];
    const cutoff = Date.now() - timeWindowSec * 1000;
    return history.filter((p) => p.timestamp >= cutoff);
  }, [history, timeWindowSec]);

  // Determine Y-axis Min & Max
  const { yMin, yMax } = useMemo(() => {
    if (!isAuto && widget.yAxisMin !== undefined && widget.yAxisMax !== undefined) {
      return { yMin: widget.yAxisMin, yMax: widget.yAxisMax };
    }

    if (visiblePoints.length === 0) {
      return { yMin: command?.minVal ?? 0, yMax: command?.maxVal ?? 100 };
    }

    let min = Infinity;
    let max = -Infinity;
    for (const p of visiblePoints) {
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }

    if (min === max) {
      min = Math.max(0, min - 10);
      max = max + 10;
    } else {
      // Add 10% breathing room
      const diff = max - min;
      min = Math.floor(min - diff * 0.1);
      max = Math.ceil(max + diff * 0.1);
    }

    return { yMin: min, yMax: max };
  }, [isAuto, widget.yAxisMin, widget.yAxisMax, visiblePoints, command]);

  // SVG Geometry
  const width = 320;
  const height = 110;
  const padLeft = 32;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 20;

  const graphWidth = width - padLeft - padRight;
  const graphHeight = height - padTop - padBottom;

  const { linePath, areaPath, lastPoint } = useMemo(() => {
    if (visiblePoints.length < 2) {
      return { linePath: '', areaPath: '', lastPoint: null };
    }

    const now = Date.now();
    const startTime = now - timeWindowSec * 1000;

    const coords = visiblePoints.map((p) => {
      const timeRatio = Math.max(0, Math.min(1, (p.timestamp - startTime) / (now - startTime)));
      const x = padLeft + timeRatio * graphWidth;

      const yRatio = yMax > yMin ? (p.value - yMin) / (yMax - yMin) : 0.5;
      const y = padTop + graphHeight * (1 - Math.max(0, Math.min(1, yRatio)));
      return { x, y };
    });

    const lPath = coords.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    const firstPt = coords[0];
    const lastPt = coords[coords.length - 1];
    const bottomY = padTop + graphHeight;
    const aPath = `${lPath} L ${lastPt.x.toFixed(1)} ${bottomY} L ${firstPt.x.toFixed(1)} ${bottomY} Z`;

    return { linePath: lPath, areaPath: aPath, lastPoint: lastPt };
  }, [visiblePoints, timeWindowSec, yMin, yMax, graphWidth, graphHeight]);

  const formattedVal =
    value !== null
      ? Math.abs(value) < 10 && value % 1 !== 0
        ? value.toFixed(1)
        : Math.round(value).toString()
      : '—';

  const gradId = `speedGrad_${widget.id}`;

  return (
    <div className="line-graph-widget-container">
      {/* Metric Header (Serif title + value row, keeping top-right free from kebab overlap) */}
      <div className="line-graph-header">
        <div className="line-graph-header-left">
          <span className="widget-metric-label">{command?.commandName || 'Vehicle Speed'}</span>
          <div className="metric-value-row">
            <span className="metric-large-value tabular-nums">{formattedVal}</span>
            {command?.units && (
              <span className="metric-unit-text">{command.units}</span>
            )}
            <span className="scale-mode-faint-tag">
              {isAuto ? 'auto' : `${timeWindowSec}s`}
            </span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="graph-svg-wrapper">
        <svg viewBox={`0 0 ${width} ${height}`} className="line-graph-svg">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Single faint solid gridline across baseline */}
          <line
            x1={padLeft}
            y1={padTop + graphHeight}
            x2={width - padRight}
            y2={padTop + graphHeight}
            stroke="var(--track)"
            strokeWidth="1"
          />

          {/* Faint axis labels */}
          <text
            x={padLeft - 6}
            y={padTop + 4}
            className="graph-axis-text tabular-nums"
            textAnchor="end"
          >
            {yMax}
          </text>
          <text
            x={padLeft - 6}
            y={padTop + graphHeight + 3}
            className="graph-axis-text tabular-nums"
            textAnchor="end"
          >
            {yMin}
          </text>

          {/* Soft gradient fill fading to transparent */}
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

          {/* 1.5px --accent stroke */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Small soft end dot */}
          {lastPoint && (
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r="2.5"
              fill="var(--accent)"
            />
          )}

          {/* Tiny muted time labels */}
          <text
            x={padLeft}
            y={height - 2}
            className="graph-axis-text tabular-nums"
            textAnchor="start"
          >
            -{timeWindowSec}s
          </text>
          <text
            x={width - padRight}
            y={height - 2}
            className="graph-axis-text tabular-nums"
            textAnchor="end"
          >
            now
          </text>
        </svg>
      </div>
    </div>
  );
};
