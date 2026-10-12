import * as os from 'os';
import * as node_path from 'path';

import { File } from '../../../lib/node_utility/File';
import { ResourceManager } from '../../ResourceManager';
import { showMessage } from '../../ui/notifier';
import { Target } from './Target';

/**
 * 8051 family target (Keil C51 compiler).
 */
export class C51Target extends Target {

    protected checkProject(target: any): Error | undefined {
        if (target['TargetOption']['Target51'] === undefined ||
            target['TargetOption']['Target51']['C51'] === undefined) {
            return new Error(`This uVision project is not a C51 project, but have a 'uvproj' suffix !`);
        }
        return undefined;
    }

    protected getIncString(target: any): string {
        const target51 = target['TargetOption']['Target51']['C51'];
        return target51['VariousControls']['IncludePath'];
    }

    protected getDefineString(target: any): string {
        const target51 = target['TargetOption']['Target51']['C51'];
        return target51['VariousControls']['Define'];
    }

    protected getSysDefines(_target: any): string[] {
        return [
            '__C51__',
            '__VSCODE_C51__',
            'reentrant=',
            'compact=',
            'small=',
            'large=',
            'data=',
            'idata=',
            'pdata=',
            'bdata=',
            'xdata=',
            'code=',
            'bit=char',
            'sbit=char',
            'sfr=char',
            'sfr16=int',
            'sfr32=int',
            'interrupt=',
            'using=',
            '_at_=',
            '_priority_=',
            '_task_='
        ];
    }

    protected getGroups(target: any): any[] {
        return target['Groups']['Group'] || [];
    }

    protected getSystemIncludes(_target: any): string[] | undefined {
        const exeFile = new File(ResourceManager.getInstance().getC51UV4Path());
        if (exeFile.IsFile()) {
            return [
                node_path.dirname(exeFile.dir) + File.sep + 'C51' + File.sep + 'INC'
            ];
        }
        return undefined;
    }

    protected getUv4Path(): string {
        return ResourceManager.getInstance().getC51UV4Path();
    }

    /**
     * C51 keeps to 4 jobs to avoid overwhelming the toolchain's locking.
     */
    protected getJobCount(): number {
        const numCPUs = os.cpus().length;
        return Math.max(1, Math.min(numCPUs, 4));
    }

    protected getFlashCommand(): { useWine: boolean; args: string[] } {
        const resManager = ResourceManager.getInstance();
        const flashDevice = resManager.getFlashDevice();
        if (flashDevice === 'KEIL5 MDK') {
            // Uv4Caller-style: needs the wrapper, so goes through wine mode
            return {
                useWine: true,
                args: [
                    '--uv4Path', resManager.getC51UV4Path(),
                    '--prjPath', this.project.uvprjFile.path,
                    '--targetName', this.targetName,
                    '-c', '${uv4Path} -f ${prjPath} -j0 -t ${targetName}'
                ]
            };
        }

        if (flashDevice === 'ST-LINK V2') {
            showMessage("C51 Unsupported ST-LINK V2 device", "error");
            return { useWine: false, args: [] };
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
        showMessage("C51 Unsupported flash device", "error");
        return { useWine: false, args: [] };
    }
}
