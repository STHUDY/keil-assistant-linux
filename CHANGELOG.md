# Change Log

## [v2.0.0]

### Flash device support
- Add **CMSIS DAP Link** flash device (uses `openocd` with `interface/cmsis-dap.cfg`); works for ARM, C51 and C251 targets.
- Add new setting `KeilAssistantLinux.flash.openocdPath` for the OpenOCD executable.
- Add **KEIL5 MDK** flash mode that drives Keil's `UV4.exe -f ...` through the bundled `Uv4Caller.exe` wrapper, so the full Keil flash pipeline (including CMSIS DAP / ST-Link / etc. as configured inside Keil) is available on Linux.

### Settings
- Rename `KeilAssistantLinux.MDK.Uv4Path` to `KeilAssistantLinux.ARM.Uv4Path` for consistency with the new `ARM` family in the project classifier. NLS keys updated accordingly (`keil.arm.uv4path.description`).
- Add `KeilAssistantLinux.C251.Uv4Path` for C251 projects (was previously falling back to the C51 path).
- Add a CMSIS DAP Link option alongside ST-LINK V2 in `KeilAssistantLinux.flash.device`.

### Build
- Multi-core parallel compilation: ARM uses all available CPU cores, C51/C251 capped at 4.
- `WINEPREFIX=~/.wine` is now auto-expanded to an absolute path (Wine rejects the literal `~`).

### Bug fixes
- "Class extends value undefined" on activation — caused by a circular import between `Target.ts` and its three subclasses; fixed by extracting the family-detection logic into `targetFactory.ts`.
- KEIL5 MDK flash command: removed double wine-prefix wrapping and made TaskExecutor inject the `-o <logfile>` argument that `Uv4Caller.exe` requires.

### Refactor
- Split the original 2,591-line `extension.ts` into 16 focused files under `src/project/`, `src/ui/`, `src/util/`.
- Deduplicate shared logic across `C51Target` / `C251Target` / `ArmTarget` (output-hex resolution, build command template, ref-line parsing).
- Extract `TaskExecutor` so Wine and Shell task execution share one path.

## [v1.2.0]

### Merge and update C251 support

## [v1.1.3]

### Fix default path can't directly open

## [v1.1.0]

### Add st-flash

## [v1.0.0]

- First release
