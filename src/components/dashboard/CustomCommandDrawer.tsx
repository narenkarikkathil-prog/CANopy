import React from 'react';
import { useVehicle } from '../../context/VehicleContext';
import { useBLE } from '../../context/BLEContext';
import { IconChevronDown, IconChevronUp, IconTerminal, IconTrash } from '@tabler/icons-react';

export const CustomCommandDrawer: React.FC = () => {
  const { availableCommands, activeVehicleName, deleteCommand } = useVehicle();
  const { liveValues, isDrawerOpen, setIsDrawerOpen } = useBLE();

  const customCommands = availableCommands.filter((c) => c.isCustom);

  return (
    <div className="card custom-command-drawer">
      <button
        type="button"
        className="drawer-toggle-header"
        onClick={() => setIsDrawerOpen(!isDrawerOpen)}
        aria-expanded={isDrawerOpen}
        aria-controls="custom-command-list"
      >
        <div className="drawer-title-group">
          <IconTerminal size={17} className="drawer-icon" />
          <span className="drawer-title serif-heading">
            Custom Command Telemetry ({customCommands.length})
          </span>
          <span className="drawer-vehicle-tag">{activeVehicleName}</span>
        </div>
        <div className="drawer-chevron">
          {isDrawerOpen ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </div>
      </button>

      {isDrawerOpen && (
        <div id="custom-command-list" className="drawer-content">
          {customCommands.length === 0 ? (
            <p className="empty-drawer-text">
              No custom commands defined for {activeVehicleName}. Author one in "Commands & Data" or import a CSV profile.
            </p>
          ) : (
            <div className="custom-commands-table-wrapper">
              <table className="custom-commands-table">
                <thead>
                  <tr>
                    <th>Command</th>
                    <th>Header</th>
                    <th>PID</th>
                    <th>Live Value</th>
                    <th>Units</th>
                    <th className="th-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customCommands.map((cmd) => {
                    const rawVal = liveValues[cmd.id];
                    const formatted =
                      rawVal !== undefined && rawVal !== null
                        ? Math.abs(rawVal) < 10 && rawVal % 1 !== 0
                          ? rawVal.toFixed(2)
                          : Math.round(rawVal).toString()
                        : '—';

                    return (
                      <tr key={cmd.id}>
                        <td className="cmd-name">{cmd.commandName}</td>
                        <td className="cmd-header tabular-nums">{cmd.header}</td>
                        <td className="cmd-pid tabular-nums">{cmd.modePid}</td>
                        <td className="cmd-live-val tabular-nums">{formatted}</td>
                        <td className="cmd-units">{cmd.units}</td>
                        <td className="cmd-action">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
