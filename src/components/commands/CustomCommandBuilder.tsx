import React, { useState, useMemo } from 'react';
import { useVehicle } from '../../context/VehicleContext';
import { testFormulaSyntax } from '../../services/formulaParser';
import {
  IconPlus,
  IconCheck,
  IconAlertTriangle,
  IconTrash,
  IconTerminal,
  IconCar,
} from '@tabler/icons-react';

export const CustomCommandBuilder: React.FC = () => {
  const {
    addCustomCommand,
    deleteCommand,
    deleteAllCustomCommands,
    availableCommands,
    activeVehicleName,
    vehicles,
    setActiveVehicleName,
  } = useVehicle();

  const [commandName, setCommandName] = useState('');
  const [header, setHeader] = useState('7E0');
  const [modePid, setModePid] = useState('');
  const [formula, setFormula] = useState('');
  const [units, setUnits] = useState('');
  const [minVal, setMinVal] = useState<number>(0);
  const [maxVal, setMaxVal] = useState<number>(100);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Extract custom commands for active vehicle
  const customCommands = useMemo(() => {
    return availableCommands.filter((c) => c.isCustom);
  }, [availableCommands]);

  // Live Formula Test
  const syntaxCheck = formula.trim() ? testFormulaSyntax(formula) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!commandName.trim() || !header.trim() || !modePid.trim() || !formula.trim() || !units.trim()) {
      return;
    }

    try {
      await addCustomCommand({
        vehicleName: activeVehicleName,
        commandName: commandName.trim(),
        header: header.trim().toUpperCase(),
        modePid: modePid.trim().toUpperCase(),
        formula: formula.trim(),
        units: units.trim(),
        minVal,
        maxVal,
      });

      setFeedbackMsg(`Command "${commandName}" saved and added to your custom list!`);
      // Reset form
      setCommandName('');
      setModePid('');
      setFormula('');
      setUnits('');
      setMinVal(0);
      setMaxVal(100);

      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      alert(`Error saving command: ${err.message}`);
    }
  };

  const handleDeleteCommand = async (commandId: string, cmdName: string) => {
    try {
      await deleteCommand(commandId);
      setConfirmDeleteId(null);
      setFeedbackMsg(`Deleted custom command "${cmdName}".`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      alert(`Error deleting command: ${err.message}`);
    }
  };

  const handleDeleteAllForVehicle = async () => {
    if (
      window.confirm(
        `Are you sure you want to delete all ${customCommands.length} custom commands for ${activeVehicleName}?`
      )
    ) {
      await deleteAllCustomCommands(activeVehicleName);
      setFeedbackMsg(`All custom commands for ${activeVehicleName} were removed.`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  return (
    <div className="custom-builder-container">
      {/* Builder Form Card */}
      <div className="card custom-command-builder-card">
        <div className="builder-header">
          <div className="builder-header-title-group">
            <h3 className="section-title serif-heading">Custom OBD Command Builder</h3>
            <div className="shared-vehicle-selector">
              <label htmlFor="builder-active-vehicle" className="shared-vehicle-label">
                <IconCar size={16} />
                <span>Target:</span>
              </label>
              <select
                id="builder-active-vehicle"
                className="vehicle-dropdown-clean"
                value={activeVehicleName}
                onChange={(e) => setActiveVehicleName(e.target.value)}
              >
                {vehicles.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="section-subtitle">
            Define a custom PID with mathematical formula evaluation for <strong>{activeVehicleName}</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="builder-form">
          <div className="form-row">
            <div className="form-group col-half">
              <label className="form-label" htmlFor="custom-cmd-name">
                Command Name
              </label>
              <input
                id="custom-cmd-name"
                type="text"
                placeholder="e.g. HV Battery State of Charge"
                value={commandName}
                onChange={(e) => setCommandName(e.target.value)}
                required
              />
            </div>

            <div className="form-group col-quarter">
              <label className="form-label" htmlFor="custom-cmd-header">
                Header / CAN ID
              </label>
              <input
                id="custom-cmd-header"
                type="text"
                placeholder="e.g. 7E4 or 7E0"
                value={header}
                onChange={(e) => setHeader(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="form-group col-quarter">
              <label className="form-label" htmlFor="custom-cmd-pid">
                Mode / PID
              </label>
              <input
                id="custom-cmd-pid"
                type="text"
                placeholder="e.g. 224801 or 010C"
                value={modePid}
                onChange={(e) => setModePid(e.target.value.toUpperCase())}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group col-half">
              <label className="form-label" htmlFor="custom-cmd-formula">
                Equation / Formula (Supports byte vars A, B, C...)
              </label>
              <input
                id="custom-cmd-formula"
                type="text"
                placeholder="e.g. ((((A*256)+B)*0.2)/100) or A-40"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                required
              />
              {/* Live Syntax Validation Indicator */}
              {syntaxCheck && (
                <div
                  className={`formula-syntax-hint ${
                    syntaxCheck.success ? 'syntax-valid' : 'syntax-invalid'
                  }`}
                >
                  {syntaxCheck.success ? (
                    <>
                      <IconCheck size={14} />
                      <span>
                        Syntax Valid (Test output with A=26, B=248: <strong>{syntaxCheck.result}</strong>)
                      </span>
                    </>
                  ) : (
                    <>
                      <IconAlertTriangle size={14} />
                      <span>Syntax Error: {syntaxCheck.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="form-group col-quarter">
              <label className="form-label" htmlFor="custom-cmd-units">
                Units
              </label>
              <input
                id="custom-cmd-units"
                type="text"
                placeholder="e.g. %, RPM, V, psi, °C"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                required
              />
            </div>

            <div className="form-group col-eighth">
              <label className="form-label" htmlFor="custom-cmd-min">
                Min
              </label>
              <input
                id="custom-cmd-min"
                type="number"
                value={minVal}
                onChange={(e) => setMinVal(parseFloat(e.target.value) || 0)}
                required
              />
            </div>

            <div className="form-group col-eighth">
              <label className="form-label" htmlFor="custom-cmd-max">
                Max
              </label>
              <input
                id="custom-cmd-max"
                type="number"
                value={maxVal}
                onChange={(e) => setMaxVal(parseFloat(e.target.value) || 100)}
                required
              />
            </div>
          </div>

          <div className="builder-actions">
            {feedbackMsg && (
              <div className="builder-feedback-pill">
                <IconCheck size={16} />
                <span>{feedbackMsg}</span>
              </div>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={syntaxCheck ? !syntaxCheck.success : false}
            >
              <IconPlus size={18} />
              <span>Save Custom Command</span>
            </button>
          </div>
        </form>
      </div>

      {/* Existing Custom Commands List & Delete Management */}
      <div className="card custom-command-management-card">
        <div className="management-header">
          <div className="management-title-group">
            <IconTerminal size={22} className="card-header-icon" />
            <h3 className="section-title serif-heading">
              Custom Commands for {activeVehicleName}
            </h3>
            <span className="badge-pill command-count-badge">
              {customCommands.length} custom command{customCommands.length === 1 ? '' : 's'}
            </span>
          </div>
          {customCommands.length > 1 && (
            <button
              type="button"
              className="btn-danger-outline btn-sm"
              onClick={handleDeleteAllForVehicle}
              title={`Remove all custom commands for ${activeVehicleName}`}
            >
              <IconTrash size={14} />
              <span>Delete All Custom ({customCommands.length})</span>
            </button>
          )}
        </div>

        {customCommands.length === 0 ? (
          <div className="empty-custom-commands">
            <IconTerminal size={32} className="empty-icon-muted" />
            <p className="empty-text-title">No custom commands for {activeVehicleName}</p>
            <p className="empty-text-sub">
              Define a custom PID in the form above or upload a CSV file to add custom signals to this vehicle profile.
            </p>
          </div>
        ) : (
          <div className="table-responsive-container">
            <table className="command-table">
              <thead>
                <tr>
                  <th>Command Name</th>
                  <th>Header</th>
                  <th>PID</th>
                  <th>Formula</th>
                  <th>Units</th>
                  <th>Range</th>
                  <th>Source</th>
                  <th className="th-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {customCommands.map((cmd) => {
                  const isConfirming = confirmDeleteId === cmd.id;

                  return (
                    <tr key={cmd.id} className="row-custom">
                      <td className="cell-name">
                        <strong>{cmd.commandName}</strong>
                      </td>
                      <td className="cell-header tabular-nums">{cmd.header}</td>
                      <td className="cell-pid tabular-nums">{cmd.modePid}</td>
                      <td className="cell-formula">
                        <code>{cmd.formula}</code>
                      </td>
                      <td className="cell-units">{cmd.units}</td>
                      <td className="cell-range tabular-nums">
                        {cmd.minVal} – {cmd.maxVal}
                      </td>
                      <td className="cell-source">
                        <span className="badge-pill source-badge">
                          {cmd.sourceCsvName ? `CSV: ${cmd.sourceCsvName}` : 'Manual Builder'}
                        </span>
                      </td>
                      <td className="cell-type">
                        {isConfirming ? (
                          <div className="confirm-delete-inline">
                            <button
                              type="button"
                              className="btn-danger-confirm-xs"
                              onClick={() => handleDeleteCommand(cmd.id, cmd.commandName)}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              className="btn-ghost-xs"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-delete-cmd-row"
                            onClick={() => setConfirmDeleteId(cmd.id)}
                            title={`Delete ${cmd.commandName}`}
                            aria-label={`Delete ${cmd.commandName}`}
                          >
                            <IconTrash size={14} />
                            <span>Delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
