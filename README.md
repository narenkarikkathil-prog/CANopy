# Canopy 🏎️⚡

> **Modern Web-Native OBD-II & CAN Bus Telemetry Dashboard**  
> Connect wirelessly via Bluetooth Low Energy (BLE), Bluetooth Classic (SPP), or USB diagnostic cables directly in your browser. Powered by the open-source [OBDb](https://github.com/OBDb) vehicle signal database.

---

## Overview

**Canopy** is a browser-native automotive telemetry and diagnostics platform. It connects to your vehicle's OBD-II port through standard ELM327-compatible adapters using the modern **Web Bluetooth API** and **Web Serial API**—requiring zero native software installation or app-store downloads.

Whether you drive a modern electric vehicle (such as a Ford Mustang Mach-E), a hybrid (Ford Fusion Hybrid, Toyota Highlander Hybrid), or any standard internal-combustion car, Canopy provides real-time gauges, rolling historical graphs, custom PID builders, CSV import/export, and a live AT command terminal.

---

## Key Features

### 📡 Multi-Standard Hardware Connectivity
- **Bluetooth Low Energy (BLE)**: Universal wireless connection via Web Bluetooth. Compatible with iPhones and iPads using Web BLE browsers (such as [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055)), as well as desktop Chrome and Edge.
- **Bluetooth Classic (SPP / RFCOMM)**: High-speed serial connection (up to 115,200 baud) for adapters like the OBDLink MX+, OBDLink LX, and vLinker on macOS, Windows, Linux, and Android.
- **USB Serial Cables**: Direct wired diagnostic cables (OBDLink EX/SX, FTDI FT232R, CH340, Prolific) with zero wireless latency.
- **Offline Adapter Simulation**: Built-in dynamic ELM327 BLE simulator that generates plausible live CAN responses for any vehicle profile without needing physical hardware.

### 🚗 Vehicle Profiles & OBDb Signalsets
- Pre-bundled profiles directly sourced from the open-source **OBDb Community Database**:
  - **Ford Mustang Mach-E**: High-voltage battery pack voltage/current, state of charge (SOC), cell temperatures, motor speeds, and thermal telemetry.
  - **Ford Fusion Hybrid & Energi**: Hybrid battery state of charge, module voltages, generator speeds, and drive modes.
  - **Toyota Highlander & Grand Highlander (Hybrid & Gas)**: Hybrid Synergy Drive (HSD) metrics, inverter temps, and traction battery data.
  - **SAE J1979 Standard OBD-II**: Universal Mode 01 parameters (RPM, vehicle speed, coolant temp, intake air temp, throttle position, etc.).
- Multi-year filtering and profile switching directly from the top navigation bar.

### 📊 Customizable Dashboard & Live Widgets
- **Gauges & Dials**: Circular indicators with min/max bounds and live value updates.
- **Time-Series Charts**: 60-second rolling trend charts for dynamic parameters (RPM, speed, battery current).
- **Stat Cards & Data Tables**: Compact overview cards and full signal tables.
- **Widget Customization**: Add, remove, rearrange, and bind widgets to any available vehicle signal.

### 🛠️ Command Library & Custom PID Builder
- Browse hundreds of Mode 01, Mode 21, and Mode 22 (UDS ReadDataByIdentifier) signals.
- **Custom Command Creator**: Define custom PIDs with custom CAN request headers (e.g. `7E0`, `6F5`), custom formulas (`((A*256)+B)/4`), signed two's-complement handling (`signed(...)`), and custom units.
- Delete custom commands directly from the library.

### 📂 CSV Import & Export Engine
- Bulk import custom vehicle signal profiles using standard CSV files.
- Includes strict schema validation, formula syntax testing, and an instant template download.
- Export vehicle command catalogs for backup or sharing with the OBDb community.

### 💻 Live AT Diagnostic Console
- Real-time logging of all raw `TX` (transmitted) and `RX` (received) ELM327 frames.
- Protocol step-by-step initialization sequence inspection (`AT Z` → `AT E0` → `AT SP 6` → `AT H1`).
- Manual command prompt for testing direct query responses.

### 🛡️ Safety Architecture & 12V Battery Guard
- **Strict Read-Only Allowlist**: Commands that write to flash memory, reset ECUs, clear DTCs, or actuate relays (e.g. UDS modes `0x2E`, `0x2F`, `0x31`, `0x10`, `0x14`) are strictly blocked at the transport layer.
- **12V Auxiliary Battery Guard**: Continuously checks 12V system voltage (`AT RV`) and pauses polling if voltage drops below 11.8V to protect auxiliary batteries from parasitic drain.

---

## Hardware & Browser Compatibility

| Connection Mode | Supported Adapters | Compatible Platforms & Browsers |
|---|---|---|
| **Bluetooth Low Energy (BLE)** | OBDLink MX+ *(BLE mode)*, OBDLink CX, Veepeak OBDCheck BLE/BLE+, Vgate iCar Pro BLE 4.0, Carista, LELink 2, UniCarScan UCSI-2100 | **Universal**: Apple iOS (via [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055)), Android (Chrome), macOS / Windows / Linux (Chrome & Edge) |
| **Bluetooth Classic (SPP)** | OBDLink MX+, OBDLink LX, vLinker FD+/MC+, BAFX Products 34t5 | **Desktop & Android**: Google Chrome, Microsoft Edge, Opera *(iOS does not support Web Serial)* |
| **USB Diagnostic Cable** | OBDLink EX, OBDLink SX, ScanTool USB, FTDI FT232R, CH340, Prolific PL2303 | **Desktop**: macOS, Windows, Linux via Google Chrome & Microsoft Edge |
| **Offline Simulation** | Built-in Mock BLE Service | All modern web browsers |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- npm or yarn

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/narenkarikkathil-prog/CANopy.git
cd CANopy
npm install
```

### Development Server
Start the local Vite development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in Google Chrome, Microsoft Edge, or Bluefy (on iOS).

### Production Build
Compile TypeScript and bundle for production:
```bash
npm run build
npm run preview
```

---

## Project Structure

```
CANopy/
├── src/
│   ├── components/
│   │   ├── ble/              # BLE & Serial connection panel and AT console
│   │   ├── commands/         # Command library table, custom PID builder, CSV uploader
│   │   ├── dashboard/        # Live gauges, charts, stat widgets, and drawer
│   │   ├── help/             # Hardware guide, troubleshooting, and CSV format docs
│   │   └── layout/           # App navigation sidebar and top header
│   ├── context/
│   │   ├── BLEContext.tsx    # Connection state, active service, telemetry polling
│   │   ├── VehicleContext.tsx# Active vehicle profile, custom signals, year filter
│   │   └── WidgetContext.tsx # Dashboard widget layout and configuration
│   ├── data/
│   │   └── obdbBundle.ts     # Pre-bundled OBDb vehicle datasets
│   ├── services/
│   │   ├── bleService.ts     # Web Bluetooth API driver (GATT UART)
│   │   ├── serialService.ts  # Web Serial API driver (Bluetooth Classic & USB)
│   │   ├── mockBleService.ts # Dynamic offline ELM327 BLE simulator
│   │   ├── obdParser.ts      # ELM327 hex decoder & formula engine
│   │   ├── obdbParser.ts     # OBDb dataset parser & safety allowlist
│   │   ├── csvEngine.ts      # CSV parser and template generator
│   │   └── storage.ts        # IndexedDB persistence (idb)
│   ├── types/                # TypeScript definitions for telemetry, ble, widgets
│   ├── App.tsx               # Root component and tab routing
│   └── index.css             # Design system and responsive styles
└── data/
    └── obdb/                 # Raw OBDb vehicle signalsets
```

---

## CSV Formatting Guide

To import your own custom vehicle profile, provide a CSV with the following columns:

```csv
VEHICLE_NAME,COMMAND_NAME,HEADER,MODE_PID,FORMULA,UNITS,MIN_VAL,MAX_VAL
My Custom EV,Traction Battery Voltage,7E4,224802,((A*256)+B)*0.1,V,200,450
My Custom EV,Traction Battery Current,7E4,224803,(signed(A*256+B))*0.05,A,-150,250
```

- **Variables**: `A`, `B`, `C`, `D` represent the consecutive data bytes (0–255) returned in the ECU response.
- **Signed Values**: Wrap signed 16-bit or 8-bit calculations in `signed(...)`.

---

## License & Attribution

- **Application Code**: MIT License.
- **Vehicle Telemetry Database**: Powered by the [OBDb Community Database](https://github.com/OBDb), licensed under the [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/) license.
