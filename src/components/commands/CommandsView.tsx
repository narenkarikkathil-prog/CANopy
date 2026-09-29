import React, { useState } from 'react';
import { CsvUploader } from './CsvUploader';
import { CommandLibraryTable } from './CommandLibraryTable';
import { CustomCommandBuilder } from './CustomCommandBuilder';

export const CommandsView: React.FC = () => {
  const [subTab, setSubTab] = useState<'library' | 'builder' | 'csv'>('library');

  return (
    <div className="commands-view-container">
      {/* Sub-navigation tabs */}
      <div className="sub-nav-bar">
        <div className="segmented-control">
          <button
            type="button"
            className={subTab === 'library' ? 'active' : ''}
            onClick={() => setSubTab('library')}
          >
            Command Library
          </button>
          <button
            type="button"
            className={subTab === 'builder' ? 'active' : ''}
            onClick={() => setSubTab('builder')}
          >
            Create Custom Command
          </button>
          <button
            type="button"
            className={subTab === 'csv' ? 'active' : ''}
            onClick={() => setSubTab('csv')}
          >
            CSV Import
          </button>
        </div>
      </div>

      <div className="sub-view-content">
        {subTab === 'library' && <CommandLibraryTable />}
        {subTab === 'builder' && <CustomCommandBuilder />}
        {subTab === 'csv' && <CsvUploader />}
      </div>
    </div>
  );
};
