import React, { useState } from 'react';
import { useVehicle } from '../../context/VehicleContext';
import { testFormulaSyntax } from '../../services/formulaParser';
import { IconPlus, IconCheck, IconAlertTriangle } from '@tabler/icons-react';

export const CustomCommandBuilder: React.FC = () => {
  const { addCustomCommand, activeVehicleName } = useVehicle();

  const [commandName, setCommandName] = useState('');
  const [header, setHeader] = useState('7E0');
  const [modePid, setModePid] = useState('');
  const [formula, setFormula] = useState('');
  const [units, setUnits] = useState('');
  const [minVal, setMinVal] = useState<number>(0);
  const [maxVal, setMaxVal] = useState<number>(100);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

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

      setFeedbackMsg(`Command "${commandName}" saved and available in Signal Source dropdowns!`);
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

  return (
    <div className="card custom-command-builder-card">
      <div className="builder-header">
        <h3 className="section-title serif-heading">Custom OBD Command Builder</h3>
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
          <button type="submit" className="btn-primary" disabled={syntaxCheck ? !syntaxCheck.success : false}>
            <IconPlus size={18} />
            <span>Save Custom Command</span>
          </button>
        </div>
      </form>
    </div>
  );
};
