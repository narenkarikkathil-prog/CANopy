import React from 'react';
import {
  IconDownload,
  IconHelpCircle,
  IconFileSpreadsheet,
  IconBluetooth,
  IconPlugConnected,
  IconDeviceUsb,
  IconDatabase,
  IconShieldCheck,
} from '@tabler/icons-react';

export const HelpView: React.FC = () => {
  const handleDownloadTemplate = () => {
    const csvContent = [
      'VEHICLE_NAME,COMMAND_NAME,HEADER,MODE_PID,FORMULA,UNITS,MIN_VAL,MAX_VAL',
      'Ford Mustang Mach-E,Engine RPM,7E0,010C,((A*256)+B)/4,RPM,0,8000',
      'Ford Mustang Mach-E,Vehicle Speed,7E0,010D,A,km/h,0,240',
      'Ford Mustang Mach-E,HV Battery State of Charge,6F5,224801,((A*256)+B)*0.1,%,0,100',
      'Ford Mustang Mach-E,HV Battery Voltage,6F5,22480D,((A*256)+B)*0.1,V,200,500',
      'Ford Fusion Hybrid,HV Battery Voltage,7E4,224802,((A*256)+B)*0.1,V,200,450',
      'Toyota Highlander,Vehicle Speed,7E0,010D,A,km/h,0,240',
      'Toyota Highlander,Coolant Temperature,7E0,0105,A-40,°C,-40,150',
      'Standard OBD-II (J1979 only),Control Module Voltage,7E0,0142,((A*256)+B)/1000,V,0,18',
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'canopy_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="help-view-container">
      {/* Module 4 — Section 1: Connection Types & Popular Models Breakdown */}
      <div className="card help-card">
        <div className="help-card-header">
          <IconHelpCircle size={22} className="help-header-icon" />
          <h2 className="section-title serif-heading">OBD-II Connection Types &amp; Hardware Compatibility</h2>
        </div>

        <div className="guide-content">
          <p className="guide-text">
            Canopy supports virtually all modern OBD-II adapters on the market across 3 connection standards.
            Choose the connection type that matches your hardware and operating system:
          </p>

          <div className="connection-types-list">
            {/* 1. Bluetooth Low Energy (BLE) */}
            <div className="connection-type-card">
              <div className="connection-type-header">
                <div className="conn-icon-box ble-accent">
                  <IconBluetooth size={22} />
                </div>
                <div>
                  <h3 className="conn-title">1. Bluetooth Low Energy (BLE)</h3>
                  <span className="conn-subtitle">Universal wireless standard • Direct GATT connection</span>
                </div>
                <span className="badge-pill conn-badge-universal">iPhone &amp; Desktop</span>
              </div>

              <div className="conn-details-body">
                <div className="conn-section">
                  <span className="conn-label">Popular Compatible Models:</span>
                  <ul className="conn-models-list">
                    <li><strong>OBDLink MX+</strong> <em>(supports BLE mode for iOS and modern platforms)</em></li>
                    <li><strong>OBDLink CX</strong> <em>(optimized for BimmerCode &amp; standard OBD-II)</em></li>
                    <li><strong>Veepeak OBDCheck BLE / BLE+</strong></li>
                    <li><strong>Vgate iCar Pro BLE 4.0</strong></li>
                    <li><strong>Carista OBD Adapter</strong></li>
                    <li><strong>LELink 2 / LELink Bluetooth Low Energy</strong></li>
                    <li><strong>UniCarScan UCSI-2100</strong></li>
                    <li>Generic ELM327 BLE (Microchip <code>0xFFF0</code>, TI <code>0xFFE0</code>, Nordic UART <code>6E40</code>)</li>
                  </ul>
                </div>

                <div className="conn-section">
                  <span className="conn-label">Platform &amp; Browser Compatibility:</span>
                  <p className="conn-text">
                    <strong>Universal:</strong> Supported on <strong>Apple iOS (iPhone &amp; iPad)</strong> via Web BLE browsers (such as the free <em>Bluefy</em> app from the App Store), <strong>Android</strong> (Chrome), and <strong>Desktop</strong> (Chrome &amp; Edge on macOS, Windows, Linux).
                  </p>
                </div>

                <div className="conn-section">
                  <span className="conn-label">How to Connect:</span>
                  <p className="conn-text">
                    Plug into your vehicle's OBD-II port, turn ignition to ON, select <strong>BLE</strong> in Canopy's connection toggle, click <strong>Connect</strong>, and pick your adapter in the browser popup. No prior OS Bluetooth settings pairing needed.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Bluetooth Classic (SPP) */}
            <div className="connection-type-card">
              <div className="connection-type-header">
                <div className="conn-icon-box serial-accent">
                  <IconPlugConnected size={22} />
                </div>
                <div>
                  <h3 className="conn-title">2. Bluetooth Classic (SPP / RFCOMM)</h3>
                  <span className="conn-subtitle">High-speed wireless serial • Up to 115,200 baud</span>
                </div>
                <span className="badge-pill conn-badge-desktop">Desktop &amp; Android Only</span>
              </div>

              <div className="conn-details-body">
                <div className="conn-section">
                  <span className="conn-label">Popular Compatible Models:</span>
                  <ul className="conn-models-list">
                    <li><strong>OBDLink MX+</strong> <em>(high-speed Bluetooth 3.0 Classic SPP mode)</em></li>
                    <li><strong>OBDLink LX</strong> <em>(Android / Windows classic Bluetooth)</em></li>
                    <li><strong>vLinker FD+ / MC+</strong> <em>(dual-mode Bluetooth)</em></li>
                    <li><strong>BAFX Products 34t5</strong> Bluetooth OBD-II reader</li>
                    <li>Generic Bluetooth 2.1 / 3.0 ELM327 dongles</li>
                  </ul>
                </div>

                <div className="conn-section">
                  <span className="conn-label">Platform &amp; Browser Compatibility:</span>
                  <p className="conn-text">
                    Supported on <strong>Google Chrome</strong> and <strong>Microsoft Edge</strong> on macOS, Windows, Linux, and Android via the Web Serial API.
                    <br />
                    <span className="ios-warning-text">⚠️ <strong>Not supported on iPhones/iPads:</strong> Apple's iOS restricts web browsers from using Bluetooth Classic SPP serial. On iPhones/iPads, always use <strong>BLE mode</strong>.</span>
                  </p>
                </div>

                <div className="conn-section">
                  <span className="conn-label">How to Connect:</span>
                  <ol className="conn-steps-list">
                    <li>Plug the adapter into your vehicle's 16-pin OBD port.</li>
                    <li>Press the physical <strong>Connect</strong> button on the dongle (e.g. on the OBDLink MX+) until the LED flashes rapidly.</li>
                    <li>Pair the adapter in your computer or Android phone's OS Bluetooth Settings.</li>
                    <li>In Canopy, select <strong>Bluetooth</strong>, click <strong>Connect</strong>, and select the paired port in Chrome's serial prompt.</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* 3. USB Diagnostic Cables */}
            <div className="connection-type-card">
              <div className="connection-type-header">
                <div className="conn-icon-box usb-accent">
                  <IconDeviceUsb size={22} />
                </div>
                <div>
                  <h3 className="conn-title">3. USB Serial Diagnostic Cables</h3>
                  <span className="conn-subtitle">Direct wired connection • Zero latency • High data rates</span>
                </div>
                <span className="badge-pill conn-badge-desktop">Desktop Only</span>
              </div>

              <div className="conn-details-body">
                <div className="conn-section">
                  <span className="conn-label">Popular Compatible Models:</span>
                  <ul className="conn-models-list">
                    <li><strong>OBDLink EX</strong> <em>(high-speed USB adapter recommended for Ford / FORScan)</em></li>
                    <li><strong>OBDLink SX</strong> <em>(standard USB diagnostic tool)</em></li>
                    <li><strong>ScanTool OBDLink</strong> USB series</li>
                    <li>Generic FTDI (FT232R), CH340, Prolific PL2303, CP2102 USB-to-OBD cables</li>
                  </ul>
                </div>

                <div className="conn-section">
                  <span className="conn-label">Platform &amp; Browser Compatibility:</span>
                  <p className="conn-text">
                    Supported on <strong>macOS, Windows, and Linux</strong> using Google Chrome, Microsoft Edge, or Opera. <em>Not supported on mobile browsers or iPhones.</em>
                  </p>
                </div>

                <div className="conn-section">
                  <span className="conn-label">How to Connect:</span>
                  <p className="conn-text">
                    Connect the USB cable to your laptop and vehicle. Select <strong>USB</strong> in Canopy, click <strong>Connect</strong>, and select the USB Serial / COM port in the browser prompt.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="guide-step-block">
            <h3 className="guide-step-title">Step 3. Troubleshooting & Common OBD Errors</h3>
            <div className="table-responsive-container">
              <table className="troubleshooting-table">
                <thead>
                  <tr>
                    <th>Status / Error</th>
                    <th>Likely Root Cause</th>
                    <th>Recommended Solution</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>NO DATA</code></td>
                    <td>Vehicle ignition is off or vehicle bus is asleep.</td>
                    <td>Turn ignition to ON or start the engine. Verify adapter is firmly seated in the OBD-II port.</td>
                  </tr>
                  <tr>
                    <td><code>ERROR</code> or <code>?</code></td>
                    <td>Command syntax not supported or baud rate mismatch.</td>
                    <td>Tap the BLE status badge to re-run the 3-step initialization sequence (AT Z → AT SP 6 → AT H1).</td>
                  </tr>
                  <tr>
                    <td><code>UNABLE TO CONNECT</code></td>
                    <td>Adapter is paired to another phone/app or OS Bluetooth disabled.</td>
                    <td>Disconnect other OBD apps (e.g. Torque, Car Scanner) and ensure Bluetooth is toggled ON.</td>
                  </tr>
                  <tr>
                    <td><code>BUS INIT: ... ERROR</code></td>
                    <td>CAN protocol selection failed.</td>
                    <td>In the AT Console, try manually entering <code>AT SP 0</code> (automatic protocol search) and retest.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Module 4 — Section 2: CSV Formatting Guide */}
      <div className="card help-card">
        <div className="help-card-header">
          <IconFileSpreadsheet size={22} className="help-header-icon" />
          <h2 className="section-title serif-heading">CSV Formatting & Formula Guide</h2>
        </div>

        <div className="guide-content">
          <p className="guide-text">
            Canopy supports importing custom vehicle profiles via standard CSV files. The file must strictly include the following 8 header columns in exact order:
          </p>

          <pre className="code-block">
            VEHICLE_NAME, COMMAND_NAME, HEADER, MODE_PID, FORMULA, UNITS, MIN_VAL, MAX_VAL
          </pre>

          <div className="download-section">
            <button type="button" className="btn-primary" onClick={handleDownloadTemplate}>
              <IconDownload size={18} />
              <span>Download Example Template (.csv)</span>
            </button>
            <span className="download-hint">Includes Ford Mustang Mach-E, Ford Fusion Hybrid, Toyota Highlander, and Standard OBD-II sample PIDs.</span>
          </div>

          <div className="guide-step-block">
            <h3 className="guide-step-title">Multi-Byte Formula Parsing</h3>
            <p className="guide-text">
              When an OBD response returns hex data bytes, Canopy maps each returned data byte to single-letter variables starting at <code>A</code>:
            </p>
            <ul className="guide-instructions-list">
              <li><code>A</code> = 1st response data byte (0–255)</li>
              <li><code>B</code> = 2nd response data byte (0–255)</li>
              <li><code>C</code> = 3rd response data byte (0–255)</li>
              <li><code>D</code> = 4th response data byte (0–255)</li>
            </ul>
            <p className="guide-text">
              For example, in standard Engine RPM (PID <code>010C</code>), the response bytes are calculated as:
            </p>
            <pre className="code-block">((A * 256) + B) / 4</pre>
          </div>

          <div className="guide-step-block">
            <h3 className="guide-step-title">Two's-Complement & Signed Handling</h3>
            <p className="guide-text">
              Certain automotive sensors (such as battery charge/discharge current) report signed integer values. Wrap the raw byte equation in <code>signed(...)</code>:
            </p>
            <pre className="code-block">(signed(A * 256 + B)) * 0.05</pre>
            <p className="guide-text">
              Canopy's formula engine automatically converts 16-bit values exceeding 32,767 or 8-bit values exceeding 127 into negative numbers.
            </p>
          </div>
        </div>
      </div>

      {/* Module 4 — Section 3: OBDb Community Database & Attribution (CC BY-SA 4.0) */}
      <div className="card help-card">
        <div className="help-card-header">
          <IconDatabase size={22} className="help-header-icon" />
          <h2 className="section-title serif-heading">OBDb Community Database & Attribution</h2>
        </div>

        <div className="guide-content">
          <p className="guide-text">
            Canopy's vehicle telemetry database is powered by the open-source <strong>OBDb Community Database</strong>, licensed under the <strong>Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)</strong> license.
          </p>

          <div className="guide-step-block">
            <h3 className="guide-step-title">Source Repositories Used</h3>
            <ul className="guide-instructions-list">
              <li>
                <strong>OBDb/Ford-Mustang-Mach-E</strong>: High-voltage battery current/voltage, cell min/max temps, DC fast-charging limits, motor power, and EV thermal telemetry.
              </li>
              <li>
                <strong>OBDb/Ford-Fusion-Hybrid & Ford-Fusion-Energi</strong>: High-voltage battery pack state of charge, module voltages, generator speeds, and hybrid drive modes.
              </li>
              <li>
                <strong>OBDb/Toyota-Highlander & Grand-Highlander</strong>: Hybrid Synergy Drive (HSD) metrics, inverter temperatures, traction battery monitoring, and vehicle dynamics.
              </li>
              <li>
                <strong>OBDb/Ford & OBDb/Toyota</strong>: Comprehensive make-level fallback parameter sets covering transmission, engine, electrical, and chassis controllers.
              </li>
              <li>
                <strong>OBDb/SAEJ1979</strong>: Universal Mode 01 / Mode 02 standard parameter identification numbers (PIDs) applicable to all OBD-II compliant vehicles.
              </li>
            </ul>
          </div>

          <div className="guide-step-block">
            <h3 className="guide-step-title">
              <IconShieldCheck size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Diagnostic Safety Architecture
            </h3>
            <p className="guide-text">
              To guarantee complete vehicle safety, Canopy enforces a <strong>hard read-only allowlist</strong> in its command dispatch pipeline:
            </p>
            <ul className="guide-instructions-list">
              <li>
                <strong>Permitted Services</strong>: J1979 Mode <code>01</code> (Current Data), Mode <code>02</code> (Freeze Frame), Mode <code>09</code> (Vehicle Info), and UDS Read-Only Modes <code>19</code>, <code>21</code>, and <code>22</code> (ReadDataByIdentifier).
              </li>
              <li>
                <strong>Blocked Services</strong>: Any commands that write, modify flash memory, reset ECUs, clear diagnostic trouble codes, or control actuators (such as UDS <code>0x2E</code>, <code>0x2F</code>, <code>0x31</code>, <code>0x10</code>, <code>0x11</code>, <code>0x14</code>, and <code>0x27</code>) are <strong>strictly blocked</strong> at both the UI and transport layers.
              </li>
              <li>
                <strong>12V Battery Guard</strong>: Continuously monitors the 12V auxiliary battery via <code>AT RV</code> and pauses polling if voltage drops below 11.8V or if the vehicle is turned off, preventing parasitic drain on electric vehicles.
              </li>
            </ul>
          </div>

          <div className="download-section">
            <span className="download-hint">
              Learn more or contribute signal sets at <a href="https://github.com/OBDb" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>github.com/OBDb</a> and <a href="https://obdb.community" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>obdb.community</a>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
