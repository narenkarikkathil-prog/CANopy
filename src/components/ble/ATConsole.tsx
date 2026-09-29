import React, { useState, useRef, useEffect } from 'react';
import { useBLE } from '../../context/BLEContext';
import { IconSend, IconTrash, IconTerminal2 } from '@tabler/icons-react';

export const ATConsole: React.FC = () => {
  const { atLogs, sendManualCommand, clearLogs, status } = useBLE();
  const [commandInput, setCommandInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [atLogs]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || status !== 'connected' || isSubmitting) return;

    const cmd = commandInput.trim();
    setCommandInput('');
    setIsSubmitting(true);

    try {
      await sendManualCommand(cmd);
    } catch (err) {
      console.warn('Manual AT command error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card at-console-card">
      <div className="at-console-header">
        <div className="console-title-group">
          <IconTerminal2 size={18} />
          <h3 className="section-title serif-heading">Live AT Console</h3>
          <span className="badge-pill console-count-badge">{atLogs.length} events</span>
        </div>
        <div className="console-actions">
          <button
            type="button"
            className="btn-ghost icon-button-sm"
            onClick={clearLogs}
            title="Clear Console Output"
            aria-label="Clear Console Output"
          >
            <IconTrash size={16} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal Output Window */}
      <div className="at-log-terminal" ref={logContainerRef} role="log" aria-live="polite">
        {atLogs.length === 0 ? (
          <div className="terminal-placeholder">
            <span>No console output yet. Connect adapter to see initialization sequence and data transactions.</span>
          </div>
        ) : (
          atLogs.map((entry) => (
            <div key={entry.id} className={`terminal-line line-${entry.direction}`}>
              <span className="line-time tabular-nums">[{entry.timestamp}]</span>
              <span className="line-tag">
                {entry.direction === 'tx' && 'TX ▶'}
                {entry.direction === 'rx' && 'RX ◀'}
                {entry.direction === 'info' && 'INF •'}
                {entry.direction === 'error' && 'ERR ✖'}
              </span>
              <span className="line-content">{entry.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Manual Input Form */}
      <form onSubmit={handleSend} className="at-command-input-bar">
        <input
          type="text"
          placeholder={
            status === 'connected'
              ? 'Enter command (e.g. AT RV, 0100, AT DP, 010C)...'
              : 'Connect adapter first to send live AT/OBD queries'
          }
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          disabled={status !== 'connected' || isSubmitting}
          className="terminal-input tabular-nums"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={status !== 'connected' || !commandInput.trim() || isSubmitting}
        >
          <IconSend size={16} />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
