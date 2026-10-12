# Keil Assistant Linux

## Project Introduction

[keil-assistant-linux](https://github.com/STHUDY/keil-assistant-linux)

This project aims to make Keil 5 usable on Linux, so that you can write, build and flash inside VSCode without leaving the editor.

Three Keil toolchains are supported:

- **ARM** (MDK, ARMCC v5 / ARMClang v6)
- **C51** (8051)
- **C251** (8051 extended)

## Origin

[keil-assistant-linux](https://github.com/ruiwarn/keil-assistant-linux)

## Project Implementation

### Build

Builds are driven through Wine. You need to install both **Keil 5** and **wine**.

The extension invokes `bin/Uv4Caller.exe` (a thin Windows wrapper that in turn calls Keil's `UV4.exe`). Parallel jobs:

- ARM: all available CPU cores
- C51 / C251: capped at 4 cores

### Flash

Three flash devices are supported (configurable via `KeilAssistantLinux.flash.device`):

| Device | Toolchain | Command |
|---|---|---|
| **ST-LINK V2** | ARM | `st-flash [--format ihex] write <hex-or-bin>` (requires `stlink`) |
| **KEIL5 MDK** | ARM / C51 / C251 | Drives Keil's native `-f` flow through `Uv4Caller.exe` — no Linux flasher needed |
| **CMSIS DAP Link** | ARM / C51 / C251 | `openocd -f interface/cmsis-dap.cfg -f <target cfg> -c 'program ...'` (requires `openocd`) |

## Usage

### 1. Install WineHQ

[WineHQ](https://www.winehq.org/)

```bash
# Arch / Manjaro
sudo pacman -S wine wine-mono wine-gecko winetricks

# Ubuntu / Debian
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine64 wine32 winetricks
```

### 2. Configure Wine

```bash
winetricks corefonts allfonts
```

### 3. Install Keil 5

[Keil 5](https://www.keil.com/download/product/)

```bash
wine MDK-ARM.exe   # or the C51 / C251 installer
```

The default install path `C:\Keil_v5` is recommended so that include directories are auto-detected.

### 4. (Optional) Install flashing tools

Install whichever you need:

```bash
# ST-LINK V2
yay -S stlink               # Arch
sudo apt install stlink     # Ubuntu / Debian

# CMSIS DAP Link
sudo apt install openocd
```

### 5. Configure the extension in VSCode

Open Settings (`Ctrl+,`) and search for `KeilAssistantLinux`:

| Setting | Description |
|---|---|
| `Wine.Path` | Path to the `wine` executable (default `wine`) |
| `Wine.PrefixPath` | Wine prefix directory (default `~/.wine`; **`~` is expanded automatically**) |
| `C51.Uv4Path` | Path to C51 `UV4.exe` (Windows-style, e.g. `C:\Keil_v5\UV4\UV4.exe`) |
| `C251.Uv4Path` | Path to C251 `UV4.exe` |
| `ARM.Uv4Path` | Path to MDK `UV4.exe` |
| `Base.AutoReplacePath` | Replace `\` with `/` in build output (default on) |
| `Project.FileLocationList` | Extra directories to scan for Keil projects |
| `Project.ExcludeList` | Project file names to ignore (default `template.uvproj[x]`) |
| `flash.device` | Flash device (`ST-LINK V2` / `KEIL5 MDK` / `CMSIS DAP Link`) |
| `flash.st-flashPath` | Path to `st-flash` (default `st-flash`) |
| `flash.openocdPath` | Path to `openocd` (default `openocd`) |

### 6. Open a project

Click the **+** button in the **Keil uVision Project** view (or run `Keil: Open keil uVision project` from the command palette). The extension will auto-detect whether the project is C51, C251 or ARM.

## Keybindings

| Shortcut | Action |
|---|---|
| `F7` | Build |
| `Ctrl+Alt+F7` | Rebuild |
| `Ctrl+Alt+D` | Flash |

## Issue Reporting

For any issues or suggestions, please open an issue on [GitHub](https://github.com/STHUDY/keil-assistant-linux/issues).

## Differences from the original plugin

- Wine settings and Linux path fixes (e.g. automatic `~` expansion in `WINEPREFIX`)
- Support for `st-flash`
- Support for **KEIL5 MDK native flash** (wraps Keil's `UV4.exe -f ...` via `Uv4Caller.exe`)
- Support for **CMSIS DAP Link / OpenOCD** flash
- Multi-core parallel compilation
- Fixed the `Class extends value undefined` activation crash
