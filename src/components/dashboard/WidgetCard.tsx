import React, { useState, useRef, useEffect } from 'react';
import type { WidgetConfig, OBDCommand, TelemetryPoint } from '../../types/telemetry';
import { GaugeWidget } from './widgets/GaugeWidget';
import { LineGraphWidget } from './widgets/LineGraphWidget';
import { NumericWidget } from './widgets/NumericWidget';
import { IconDotsVertical, IconEdit, IconTrash } from '@tabler/icons-react';

interface WidgetCardProps {
  widget: WidgetConfig;
  command?: OBDCommand;
  value: number | null;
  history?: TelemetryPoint[];
  onEdit: () => void;
  onRemove: () => void;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({
  widget,
  command,
  value,
  history,
  onEdit,
  onRemove,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div className={`card widget-card widget-mode-${widget.type}`}>
      {/* Overflow Menu Top Right (Subtle, Muted Gray) */}
      <div className="widget-overflow-wrapper" ref={menuRef}>
        <button
          type="button"
          className="widget-overflow-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Widget options"
          aria-expanded={menuOpen}
        >
          <IconDotsVertical size={16} />
        </button>

        {menuOpen && (
          <div className="overflow-dropdown-menu">
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
            >
              <IconEdit size={15} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className="dropdown-item item-danger"
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            >
              <IconTrash size={15} />
              <span>Remove</span>
            </button>
          </div>
        )}
      </div>

      {/* Widget Content */}
      <div className="widget-body">
        {widget.type === 'gauge' && (
          <GaugeWidget widget={widget} command={command} value={value} />
        )}
        {widget.type === 'lineGraph' && (
          <LineGraphWidget
            widget={widget}
            command={command}
            value={value}
            history={history}
          />
        )}
        {widget.type === 'numeric' && (
          <NumericWidget widget={widget} command={command} value={value} />
        )}
      </div>
    </div>
  );
};
