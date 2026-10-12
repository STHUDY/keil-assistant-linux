import * as os from 'os';
import * as node_path from 'path';
import * as child_process from 'child_process';

import { File } from '../../../lib/node_utility/File';
import { ResourceManager } from '../../ResourceManager';
import { showMessage } from '../../ui/notifier';
import { isWindowsPath } from '../../util/pathUtils';
import { windowsPathToLinuxByWinePrefixPath } from '../../util/winePath';
import { CmdLineHandler } from '../../CmdLineHandler';
import { Target } from './Target';
import { MacroHandler } from './MacroHandler';

/**
 * ARM Cortex-M / ARM7 / ARM9 target (Keil MDK: ARMCC v5 or ARMClang v6).
 */
export class ArmTarget extends Target {

    private static readonly armccMacros: string[] = [
        '__CC_ARM',
        '__arm__',
        '__align(x)=',
        '__ALIGNOF__(x)=',
        '__alignof__(x)=',
        '__asm(x)=',
        '__forceinline=',
        '__restrict=',
        '__global_reg(n)=',
        '__inline=',
        '__int64=long long',
        '__INTADDR__(expr)=0',
        '__irq=',
        '__packed=',
        '__pure=',
        '__smc(n)=',
        '__svc(n)=',
        '__svc_indirect(n)=',
        '__svc_indirect_r7(n)=',
        '__value_in_regs=',
        '__weak=',
        '__writeonly=',
        '__declspec(x)=',
        '__attribute__(x)=',
        '__nonnull__(x)=',
        '__register=',

        '__breakpoint(x)=',
        '__cdp(x,y,z)=',
        '__clrex()=',
        '__clz(x)=0U',
        '__current_pc()=0U',
        '__current_sp()=0U',
        '__disable_fiq()=',
        '__disable_irq()=',
        '__dmb(x)=',
        '__dsb(x)=',
        '__enable_fiq()=',
        '__enable_irq()=',
        '__fabs(x)=0.0',
        '__fabsf(x)=0.0f',
        '__force_loads()=',
        '__force_stores()=',
        '__isb(x)=',
        '__ldrex(x)=0U',
        '__ldrexd(x)=0U',
        '__ldrt(x)=0U',
        '__memory_changed()=',
        '__nop()=',
        '__pld(...)=',
        '__pli(...)=',
        '__qadd(x,y)=0',
        '__qdbl(x)=0',
        '__qsub(x,y)=0',
        '__rbit(x)=0U',
        '__rev(x)=0U',
        '__return_address()=0U',
        '__ror(x,y)=0U',
        '__schedule_barrier()=',
        '__semihost(x,y)=0',
        '__sqrt(x)=0.0',
        '__sqrtf(x)=0.0f',
        '__ssat(x,y)=0',
        '__strex(x,y)=0U',
        '__strexd(x,y)=0',
        '__strt(x,y)=',
        '__swp(x,y)=0U',
        '__usat(x,y)=0U',
        '__wfe()=',
        '__wfi()=',
        '__yield()=',
        '__vfp_status(x,y)=0'
    ];

    private static readonly armclangMacros: string[] = [
        '__alignof__(x)=',
        '__asm(x)=',
        '__asm__(x)=',
        '__forceinline=',
        '__restrict=',
        '__volatile__=',
        '__inline=',
        '__inline__=',
        '__declspec(x)=',
        '__attribute__(x)=',
        '__nonnull__(x)=',
        '__unaligned=',
        '__promise(x)=',
        '__irq=',
        '__swi=',
        '__weak=',
        '__register=',
        '__pure=',
        '__value_in_regs=',

        '__breakpoint(x)=',
        '__current_pc()=0U',
        '__current_sp()=0U',
        '__disable_fiq()=',
        '__disable_irq()=',
        '__enable_fiq()=',
        '__enable_irq()=',
        '__force_stores()=',
        '__memory_changed()=',
        '__schedule_barrier()=',
        '__semihost(x,y)=0',
        '__vfp_status(x,y)=0',

        '__builtin_arm_nop()=',
        '__builtin_arm_wfi()=',
        '__builtin_arm_wfe()=',
        '__builtin_arm_sev()=',
        '__builtin_arm_sevl()=',
        '__builtin_arm_yield()=',
        '__builtin_arm_isb(x)=',
        '__builtin_arm_dsb(x)=',
        '__builtin_arm_dmb(x)=',

        '__builtin_bswap32(x)=0U',
        '__builtin_bswap16(x)=0U',
        '__builtin_arm_rbit(x)=0U',

        '__builtin_clz(x)=0U',
        '__builtin_arm_ldrex(x)=0U',
        '__builtin_arm_strex(x,y)=0U',
        '__builtin_arm_clrex()=',
        '__builtin_arm_ssat(x,y)=0U',
        '__builtin_arm_usat(x,y)=0U',
        '__builtin_arm_ldaex(x)=0U',
        '__builtin_arm_stlex(x,y)=0U'
    ];

    private static armclangBuildinMacros: string[] | undefined;

    constructor(prjInfo: any, uvInfo: any, targetDOM: any) {
        super(prjInfo, uvInfo, targetDOM);
        ArmTarget.initArmclangMacros();
    }

    protected checkProject(): Error | undefined {
        return undefined;
    }

    protected getOutputFolder(target: any): string | undefined {
        try {
            let outDir = target['TargetOption']['TargetCommonOption']['OutputDirectory'];
            if (!outDir) return undefined;

            // Unify separators
            outDir = outDir.replace(/\\/g, '/');

            // Strip trailing '/' if any
            if (outDir.endsWith('/')) {
                outDir = outDir.slice(0, -1);
            }

            return outDir;
        } catch {
            return undefined;
        }
    }

    /** GNU-style .d file (ARMClang uses this format). */
    private gnu_parseRefLines(lines: string[]): string[] {
        const resultList: Set<string> = new Set<string>();

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const _line = lines[lineIndex];

            const line = _line[_line.length - 1] === '\\' ? _line.substring(0, _line.length - 1) : _line;
            const subLines = line.trim().split(/(?<![\\:]) /);

            if (lineIndex === 0) {
                // First line: skip the first sub-line (the .o target)
                for (let i = 1; i < subLines.length; i++) {
                    resultList.add(subLines[i].trim().replace(/\\ /g, ' '));
                }
            } else {
                subLines.forEach((item) => {
                    resultList.add(item.trim().replace(/\\ /g, ' '));
                });
            }
        }

        return Array.from(resultList);
    }

    /** AC5-style .d file (ARMCC v5 uses this format). */
    private ac5_parseRefLines(lines: string[], startIndex = 1): string[] {
        const resultList: Set<string> = new Set<string>();

        for (let i = startIndex; i < lines.length; i++) {
            const sepIndex = lines[i].indexOf(': ');
            if (sepIndex > 0) {
                const line: string = lines[i].substring(sepIndex + 1).trim();
                resultList.add(line);
            }
        }

        return Array.from(resultList);
    }

    protected parseRefLines(target: any, lines: string[]): string[] {
        if (target['uAC6'] === '1') {
            // ARMClang
            return this.gnu_parseRefLines(lines);
        } else {
            // ARMCC
            return this.ac5_parseRefLines(lines);
        }
    }

    private static initArmclangMacros() {
        if (ArmTarget.armclangBuildinMacros === undefined) {
            const armClangPath = node_path.dirname(node_path.dirname(ResourceManager.getInstance().getArmUV4Path()))
                + File.sep + 'ARM' + File.sep + 'ARMCLANG' + File.sep + 'bin' + File.sep + 'armclang.exe';
            ArmTarget.armclangBuildinMacros = ArmTarget.getArmClangMacroList(armClangPath);
        }
    }

    protected getSysDefines(target: any): string[] {
        if (target['uAC6'] === '1') {
            // ARMClang
            return ArmTarget.armclangMacros.concat(ArmTarget.armclangBuildinMacros || []);
        } else {
            // ARMCC
            return ArmTarget.armccMacros;
        }
    }

    private static getArmClangMacroList(armClangPath: string): string[] {
        try {
            const resManager = ResourceManager.getInstance();
            const winePrefix = resManager.getWinePrefixPath();
            const prefixPart = winePrefix !== '' ? `WINEPREFIX="${winePrefix}" ` : '';
            const invokePrefix = `WINEDEBUG=-all ${prefixPart}${resManager.getWinePath()} `;

            // Use /dev/null on Linux (Uv4Caller.exe would not be invoked here)
            const cmdLine = invokePrefix + CmdLineHandler.quoteString(armClangPath, '"')
                + ' ' + ['--target=arm-arm-none-eabi', '-E', '-dM', '-', '</dev/null'].join(' ');

            const lines = child_process.execSync(cmdLine).toString().split(/\r\n|\n/);
            const resList: string[] = [];
            const mHandler = new MacroHandler();

            lines.filter((line) => line.trim() !== '')
                .forEach((line) => {
                    const value = mHandler.toExpression(line);
                    if (value) {
                        resList.push(value);
                    }
                });

            return resList;
        } catch (error) {
            console.warn(`[Keil Assistant Linux] getArmClangMacroList failed: ${error}`);
            // Fallback when armclang can't be executed (e.g. wine not set up)
            return ['__GNUC__=4', '__GNUC_MINOR__=2', '__GNUC_PATCHLEVEL__=1'];
        }
    }

    /**
     * Smart detection of the Keil ARM toolchain's include directory.
     * Tries ARMCC -> ARMCLANG -> AC6 in that order, falling back to a
     * "most compatible" path if none of them are present.
     */
    protected getSystemIncludes(target: any): string[] | undefined {
        let rawPath = ResourceManager.getInstance().getArmUV4Path();

        if (isWindowsPath(rawPath)) {
            const winePrefix = ResourceManager.getInstance().getWinePrefixPath();
            rawPath = windowsPathToLinuxByWinePrefixPath(rawPath, winePrefix);
        }

        this.project.logger.log(`[DEBUG] ========== Keil Include Path Detection Start ==========`);
        this.project.logger.log(`[DEBUG] Raw UV4 Path from config: '${rawPath}'`);

        const exeFile = new File(rawPath);
        if (!exeFile.IsFile()) {
            this.project.logger.log(`[ERROR] UV4.exe not found at: ${exeFile.path}`);
            this.project.logger.log(`[ERROR] Please check 'KeilAssistantLinux.MDK.Uv4Path' setting.`);
            return undefined;
        }

        const keilRoot = node_path.dirname(exeFile.dir);
        this.project.logger.log(`[DEBUG] Keil Root Directory: ${keilRoot}`);

        const armccDir = new File(`${keilRoot}${File.sep}ARM${File.sep}ARMCC${File.sep}include`);
        const armclangDir = new File(`${keilRoot}${File.sep}ARM${File.sep}ARMCLANG${File.sep}include`);
        const ac6Dir = new File(`${keilRoot}${File.sep}ARM${File.sep}AC6${File.sep}include`);

        const hasARMCC = armccDir.IsDir();
        const hasARMCLANG = armclangDir.IsDir();
        const hasAC6 = ac6Dir.IsDir();

        // Pick the toolchain: prefer ARMCC if present (v5 default),
        // otherwise fall back to ARMCLANG (v6 default) or AC6.
        let selectedToolName: string;
        if (hasARMCC) {
            selectedToolName = target['uAC6'] === '1' ? 'ARMCLANG' : 'ARMCC';
        } else if (hasARMCLANG) {
            selectedToolName = 'ARMCLANG';
        } else if (hasAC6) {
            selectedToolName = 'AC6';
        } else {
            selectedToolName = 'ARMCC'; // final fallback
        }

        const targetIncDir = new File(`${keilRoot}${File.sep}ARM${File.sep}${selectedToolName}${File.sep}include`);
        if (targetIncDir.IsDir()) {
            try {
                const subDirs = targetIncDir.GetList(File.EMPTY_FILTER).map((dir) => dir.path);
                return [targetIncDir.path].concat(subDirs);
            } catch {
                return [targetIncDir.path];
            }
        }

        // Final fallback: try every possible include path in order
        const fallbackPaths = [
            `${keilRoot}${File.sep}ARM${File.sep}ARMCLANG${File.sep}include`,
            `${keilRoot}${File.sep}ARM${File.sep}ARMCC${File.sep}include`,
            `${keilRoot}${File.sep}ARM${File.sep}AC6${File.sep}include`
        ];
        for (const fallbackPath of fallbackPaths) {
            const fallbackDir = new File(fallbackPath);
            if (fallbackDir.IsDir()) {
                try {
                    const subDirs = fallbackDir.GetList(File.EMPTY_FILTER).map((dir) => dir.path);
                    return [fallbackDir.path].concat(subDirs);
                } catch {
                    return [fallbackPath];
                }
            }
        }

        // Worst case: return the most likely path even if it doesn't exist
        return [`${keilRoot}${File.sep}ARM${File.sep}ARMCC${File.sep}include`];
    }

    protected getIncString(target: any): string {
        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        return dat['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any): string {
        const dat = target['TargetOption']['TargetArmAds']['Cads'];
        return dat['VariousControls']['Define'];
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] || [];
    }

    /** ARM-style diagnostic regex (slightly different from C51). */
    protected getDiagnosticRegex(): RegExp {
        return /^([^()]+)\(([\d]+)\):\s+(error|warning):\s+#([\d\w-]+):\s+(.+)$/i;
    }

    protected getUv4Path(): string {
        return ResourceManager.getInstance().getArmUV4Path();
    }

    /** ARM uses every available CPU core. */
    protected getJobCount(): number {
        return Math.max(1, os.cpus().length);
    }

    protected getFlashCommand(): { useWine: boolean; args: string[] } {
        const resManager = ResourceManager.getInstance();
        const flashDevice = resManager.getFlashDevice();

        if (flashDevice === 'KEIL5 MDK') {
            // Uv4Caller-style: needs the wrapper, so goes through wine mode
            return {
                useWine: true,
                args: [
                    '--uv4Path', resManager.getArmUV4Path(),
                    '--prjPath', this.project.uvprjFile.path,
                    '--targetName', this.targetName,
                    '-c', '${uv4Path} -f ${prjPath} -j0 -t ${targetName}'
                ]
            };
        }

        if (flashDevice === 'ST-LINK V2') {
            const hexFile = this.getOutputHexFile(this.targetDOM);
            if (!hexFile) {
                showMessage("Please build first and check the hex options", "error");
                return { useWine: false, args: [] };
            }
            if (!hexFile.IsFile()) {
                showMessage("Hex File Error", "error");
                return { useWine: false, args: [] };
            }

            const param = hexFile.suffix === '.hex' ? '--format ihex' : '';
            return {
                useWine: false,
                args: [
                    resManager.getSTFlashPath(),
                    param,
                    'write',
                    hexFile.path
                ]
            };
        }

        if (flashDevice === 'CMSIS DAP Link') {
            const hexFile = this.getOutputHexFile(this.targetDOM);
            if (!hexFile) {
                showMessage("Please build first and check the hex options", "error");
                return { useWine: false, args: [] };
            }

            const openocdCfgPath = this.getOpenocdWriteCfgFile(this.targetDOM);
            if (!openocdCfgPath) {
                showMessage("OpenOCD target configuration not found", "error");
                return { useWine: false, args: [] };
            }

            return {
                useWine: false,
                args: [
                    resManager.getOpenocdPath(),
                    '-f', 'interface/cmsis-dap.cfg',
                    '-f', openocdCfgPath.path,
                    '-c', `'program "${hexFile.path}" verify reset; shutdown'`,
                ],
            };
        }

        showMessage("Unsupported flash device", "error");
        return { useWine: false, args: [] };
    }
}
