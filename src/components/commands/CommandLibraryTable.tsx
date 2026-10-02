import React, { useState, useMemo } from 'react';
import { useVehicle } from '../../context/VehicleContext';
import { useWidgets } from '../../context/WidgetContext';
import {
  IconCar,
  IconTrash,
  IconSearch,
  IconLayoutGridAdd,
  IconCheck,
} from '@tabler/icons-react';
import type { WidgetType } from '../../types/telemetry';

export const CommandLibraryTable: React.FC = () => {
  const {
    vehicles,
    activeVehicleName,
    setActiveVehicleName,
    selectedYear,
    setSelectedYear,
    availableYears,
    availableCommands,
    deleteCommand,
  } = useVehicle();

  const { widgets, maxWidgets, addWidget } = useWidgets();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [addedSignalId, setAddedSignalId] = useState<string | null>(null);
  const [slotFullNotice, setSlotFullNotice] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 40;

  // Extract unique categories from commands, explicitly prioritizing Custom Commands
  const categories = useMemo(() => {
    const set = new Set<string>();
    let hasCustom = false;
    for (const cmd of availableCommands) {
      if (cmd.isCustom) hasCustom = true;
      if (cmd.category && cmd.category !== 'Custom / CSV') set.add(cmd.category);
    }
    const list = ['All'];
    if (hasCustom) {
      list.push('Custom Commands');
    }
    return [...list, ...Array.from(set).sort()];
  }, [availableCommands]);

  // Filter commands by search and category
  const filteredCommands = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableCommands.filter((cmd) => {
      const matchesCat =
        selectedCategory === 'All'
          ? true
          : selectedCategory === 'Custom Commands'
          ? cmd.isCustom
          : cmd.category === selectedCategory;
      if (!matchesCat) return false;

      if (!q) return true;
      return (
        cmd.commandName.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q) ||
        cmd.modePid.toLowerCase().includes(q) ||
        (cmd.category && cmd.category.toLowerCase().includes(q)) ||
        (cmd.units && cmd.units.toLowerCase().includes(q)) ||
        (cmd.sourceCsvName && cmd.sourceCsvName.toLowerCase().includes(q))
      );
    });
  }, [availableCommands, searchQuery, selectedCategory]);

  // Pagination
  const totalPages = Math.ceil(filteredCommands.length / pageSize) || 1;
  const paginatedCommands = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCommands.slice(start, start + pageSize);
  }, [filteredCommands, currentPage, pageSize]);

  // Handle adding a signal to the dashboard
  const handleAddToDashboard = async (signalId: string, cmd: any) => {
    if (widgets.length >= maxWidgets) {
      setSlotFullNotice(true);
      setTimeout(() => setSlotFullNotice(false), 3500);
      return;
    }

    // Find first available slot (0..maxWidgets-1)
    const usedSlots = new Set(widgets.map((w) => w.slotIndex));
    let freeSlot = 0;
    for (let i = 0; i < maxWidgets; i++) {
      if (!usedSlots.has(i)) {
        freeSlot = i;
        break;
      }
    }

    // Determine smart widget type based on units/metrics
    let type: WidgetType = 'numeric';
    const unitLower = (cmd.units || '').toLowerCase();
    if (unitLower === 'rpm' || unitLower === '%') {
      type = 'gauge';
    } else if (
      unitLower === 'km/h' ||
      unitLower === 'mph' ||
      unitLower === 'a' ||
      unitLower === 'v' ||
      unitLower === 'kw'
    ) {
      type = 'lineGraph';
    }

    await addWidget({
      slotIndex: freeSlot,
      type,
      signalSourceId: signalId,
      scaleMin: cmd.minVal ?? 0,
      scaleMax: cmd.maxVal && cmd.maxVal > (cmd.minVal ?? 0) ? cmd.maxVal : 100,
      accentColor: 'neon-green',
      scalingMode: 'auto',
      xAxisWindow: 30,
    });

    setAddedSignalId(signalId);
    setTimeout(() => setAddedSignalId(null), 2000);
  };

  return (
    <div className="card command-library-card">
      <div className="command-library-header">
        <div className="library-title-group">
          <h3 className="section-title serif-heading">OBDb Signal Library</h3>
          <span className="badge-pill command-count-badge">
            {filteredCommands.length} signal{filteredCommands.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Vehicle & Year Selection */}
        <div className="library-controls-group">
          <div className="shared-vehicle-selector">
            <label htmlFor="shared-library-vehicle" className="shared-vehicle-label">
              <IconCar size={16} />
              <span>Vehicle:</span>
            </label>
            <select
              id="shared-library-vehicle"
              className="vehicle-dropdown-clean"
              value={activeVehicleName}
              onChange={(e) => {
                setActiveVehicleName(e.target.value);
                setCurrentPage(1);
              }}
            >
              {vehicles.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {availableYears.length > 1 && (
            <div className="shared-vehicle-selector">
              <select
                id="library-year-selector"
                className="vehicle-dropdown-clean"
                value={selectedYear}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedYear(val === 'all' ? 'all' : parseInt(val, 10));
                  setCurrentPage(1);
                }}
              >
                {availableYears.map((yr) => (
                  <option key={yr.toString()} value={yr}>
                    {yr === 'all' ? 'All Years' : yr}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Slots full notification */}
      {slotFullNotice && (
        <div className="library-notification alert-warning">
          All {maxWidgets} dashboard slots are occupied. Remove or reconfigure a widget on the Live Telemetry screen first.
        </div>
      )}

      {/* Search & Category Filter Bar */}
      <div className="library-filter-bar">
        <div className="library-search-wrapper">
          <IconSearch size={16} className="search-icon" />
          <input
            type="text"
            className="library-search-input"
            placeholder="Search signals by name, PID (e.g. 010C, 224899), category, or unit..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Category Pills */}
        <div className="category-scroll-row" role="tablist" aria-label="Signal Categories">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory(cat);
                setCurrentPage(1);
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="table-responsive-container">
        <table className="command-table">
          <thead>
            <tr>
              <th>Signal Name</th>
              <th>Category</th>
              <th>Header</th>
              <th>Mode / PID</th>
              <th>Formula / Scaling</th>
              <th>Units</th>
              <th>Range</th>
              <th className="th-action">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCommands.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  No signals matched your search criteria.
                </td>
              </tr>
            ) : (
              paginatedCommands.map((cmd) => {
                const isAdded = addedSignalId === cmd.id;
                const isOnDashboard = widgets.some(
                  (w) =>
                    w.signalSourceId === cmd.id ||
                    cmd.id.endsWith(w.signalSourceId.replace(/^[^_]+_/, ''))
                );

                return (
                  <tr key={cmd.id} className={cmd.isCustom ? 'row-custom' : ''}>
                    <td className="cell-name">
                      <strong>{cmd.commandName}</strong>
                      {cmd.description && (
                        <div className="cell-desc-sub">{cmd.description}</div>
                      )}
                    </td>
                    <td className="cell-category">
                      <span className="badge-pill category-badge">
                        {cmd.category || 'General'}
                      </span>
                    </td>
                    <td className="cell-header tabular-nums">{cmd.header}</td>
                    <td className="cell-pid tabular-nums">{cmd.modePid}</td>
                    <td className="cell-formula">
                      <code>{cmd.formula}</code>
                    </td>
                    <td className="cell-units">{cmd.units || '—'}</td>
                    <td className="cell-range tabular-nums">
                      {cmd.minVal} – {cmd.maxVal}
                    </td>
                    <td className="cell-type">
                      <div className="action-button-row">
                        <button
                          type="button"
                          className={`btn-add-dashboard ${isAdded ? 'btn-added' : ''}`}
                          onClick={() => handleAddToDashboard(cmd.id, cmd)}
                          title="Add this signal as a Live Telemetry dashboard card"
                          disabled={isAdded}
                        >
                          {isAdded ? (
                            <>
                              <IconCheck size={14} /> Added
                            </>
                          ) : isOnDashboard ? (
                            <>
                              <IconCheck size={14} /> Active
                            </>
                          ) : (
                            <>
                              <IconLayoutGridAdd size={14} /> + Card
                            </>
                          )}
                        </button>

                        {cmd.isCustom && (
                          <button
                            type="button"
                            className="btn-ghost icon-button-sm btn-delete-cmd"
                            onClick={() => {
                              if (window.confirm(`Delete custom command "${cmd.commandName}"?`)) {
                                deleteCommand(cmd.id);
                              }
                            }}
                            title={`Delete custom command "${cmd.commandName}"`}
                            aria-label={`Delete ${cmd.commandName}`}
                          >
                            <IconTrash size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="table-pagination-bar">
          <span className="pagination-info">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filteredCommands.length)} of{' '}
            {filteredCommands.length} signals
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              className="btn-pagination"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="page-indicator">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn-pagination"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
