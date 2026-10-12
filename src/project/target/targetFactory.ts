import * as vscode from 'vscode';

import { KeilProjectInfo, uVisonInfo } from '../keilProject';
import { Target } from './Target';
import { C51Target } from './C51Target';
import { C251Target } from './C251Target';
import { ArmTarget } from './ArmTarget';

/**
 * Detect the project family from the target's XML DOM and instantiate
 * the matching {@link Target} subclass.
 *
 * Lives in its own module to avoid the circular dependency that would
 * arise if {@link Target} had to import its own subclasses.
 */
export async function createTarget(
    prjInfo: KeilProjectInfo,
    uvInfo: uVisonInfo,
    targetDOM: any
): Promise<Target> {
    const isC51Project = targetDOM['TargetOption'] &&
        targetDOM['TargetOption']['Target51'] &&
        targetDOM['TargetOption']['Target51']['C51'];

    const isC251Project = targetDOM['TargetOption'] &&
        targetDOM['TargetOption']['Target251'] &&
        targetDOM['TargetOption']['Target251']['C251'];

    const isArmProject = targetDOM['TargetOption'] &&
        (targetDOM['TargetOption']['TargetCommonOption'] ||
            targetDOM['TargetOption']['TargetArmAds']);

    if ((isC51Project || isC251Project) && !isArmProject) {
        if (isC251Project) {
            return new C251Target(prjInfo, uvInfo, targetDOM);
        }
        return new C51Target(prjInfo, uvInfo, targetDOM);
    }

    if (isArmProject && !isC51Project && !isC251Project) {
        return new ArmTarget(prjInfo, uvInfo, targetDOM);
    }

    // Family can't be auto-detected - ask the user
    const selection = await vscode.window.showQuickPick([
        { label: 'C251 工程', description: '8051 系列单片机工程', family: 'C251' },
        { label: 'C51 工程', description: '8051 系列单片机工程', family: 'C51' },
        { label: 'ARM 工程', description: 'ARM 系列单片机工程', family: 'ARM' }
    ], {
        placeHolder: '请选择工程类型',
        title: '无法自动识别工程类型，请手动选择'
    });

    if (!selection) {
        throw new Error('未选择工程类型');
    }

    switch (selection.family) {
        case 'C51': return new C51Target(prjInfo, uvInfo, targetDOM);
        case 'C251': return new C251Target(prjInfo, uvInfo, targetDOM);
        case 'ARM':
        default: return new ArmTarget(prjInfo, uvInfo, targetDOM);
    }
}
