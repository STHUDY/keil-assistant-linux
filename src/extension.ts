import * as vscode from 'vscode';

import { ResourceManager } from './ResourceManager';
import { showMessage } from './ui/notifier';
import { initDiagnosticCollection } from './ui/diagnostics';
import { ProjectExplorer } from './ui/projectExplorer';

/**
 * Detect whether the given XML snippet represents a C51-family project
 * (Keil C51 or C251) or an ARM project. Used by the "open project"
 * command to verify the matching UV4 path is configured.
 */
function classifyProject(xmlContent: string): { c51: boolean; arm: boolean } {
    const hasC51 = xmlContent.includes('TargetOption')
        && ((xmlContent.includes('Target51') && xmlContent.includes('C51'))
            || (xmlContent.includes('Target251') && xmlContent.includes('C251')));
    const hasArm = xmlContent.includes('TargetOption')
        && (xmlContent.includes('TargetCommonOption') || xmlContent.includes('TargetArmAds'));
    return { c51: hasC51, arm: hasArm };
}

/**
 * Open a single .uvproj / .uvprojx file via the project explorer. If
 * matching C51 / MDK paths are required but not configured, show a
 * helpful error and abort.
 */
async function openProjectWithValidation(
    prjExplorer: ProjectExplorer,
    uvPrjPath: string
): Promise<void> {
    // Quick read so we can warn the user about missing toolchain paths
    try {
        const xmlContent = (await vscode.workspace.fs.readFile(vscode.Uri.file(uvPrjPath))).toString();
        const { c51, arm } = classifyProject(xmlContent);

        if (c51) {
            const c51Path = vscode.workspace.getConfiguration('KeilAssistantLinux.C51').get<string>('Uv4Path');
            if (!c51Path) {
                showMessage(
                    '请先设置 C51 UV4 路径！\n' +
                    '1. 打开设置 (Ctrl+,)\n' +
                    '2. 搜索 "KeilAssistantLinux.C51.Uv4Path"\n' +
                    '3. 设置 C51 UV4.exe 的绝对路径\n' +
                    '示例路径：C:\\Keil_v5\\UV4\\UV4.exe',
                    'error'
                );
                return;
            }
        }

        if (arm) {
            const mdkPath = vscode.workspace.getConfiguration('KeilAssistantLinux.MDK').get<string>('Uv4Path');
            if (!mdkPath) {
                showMessage(
                    '请先设置 MDK UV4 路径！\n' +
                    '1. 打开设置 (Ctrl+,)\n' +
                    '2. 搜索 "KeilAssistantLinux.MDK.Uv4Path"\n' +
                    '3. 设置 MDK UV4.exe 的绝对路径\n' +
                    '示例路径：C:\\Keil_v5\\UV4\\UV4.exe',
                    'error'
                );
                return;
            }
        }
    } catch {
        // If we can't read the file we'll let openProject surface the real error
    }

    await prjExplorer.openProject(uvPrjPath);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('---- keil-assistant-linux actived ----');

    // 1. Init singletons
    ResourceManager.getInstance(context);
    initDiagnosticCollection(context);

    // 2. Create the project tree view
    const prjExplorer = new ProjectExplorer(context);
    context.subscriptions.push(prjExplorer);

    // 3. When a build task finishes, parse its log and publish diagnostics
    context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(async (event) => {
        const task = event.execution.task;
        if (task.definition.type !== 'keil-task' ||
            (task.name !== 'build' && task.name !== 'rebuild')) {
            return;
        }
        const prjID = task.definition.prjID as string | undefined;
        const targetName = task.definition.targetName as string | undefined;
        if (!prjID || !targetName) return;

        const project = prjExplorer.getProjectById(prjID);
        if (!project) {
            console.error(`Keil Assistant Linux: Could not find project with ID '${prjID}' after task end.`);
            return;
        }
        const target = project.getTargetByName(targetName);
        if (!target) {
            console.error(`Keil Assistant Linux: Could not find target '${targetName}' for project ID '${prjID}' after task end.`);
            return;
        }
        project.logger.log(`[INFO] Task '${task.name}' ended for ${targetName}. Exit code: ${event.exitCode}. Processing diagnostics.`);
        await target.processDiagnostics();
    }));

    // 4. Register commands
    const subscriber = context.subscriptions;

    subscriber.push(vscode.commands.registerCommand('keil.build', () => {
        const target = prjExplorer.getTarget();
        if (target) {
            target.build();
        } else {
            showMessage('请先选择一个工程！', 'warning');
        }
    }));

    subscriber.push(vscode.commands.registerCommand('keil.rebuild', () => {
        const target = prjExplorer.getTarget();
        if (target) {
            target.rebuild();
        } else {
            showMessage('请先选择一个工程！', 'warning');
        }
    }));

    subscriber.push(vscode.commands.registerCommand('explorer.open', async () => {
        try {
            const uvprojFiles = await vscode.workspace.findFiles('**/*.uvproj', '**/node_modules/**');
            const uvprojxFiles = await vscode.workspace.findFiles('**/*.uvprojx', '**/node_modules/**');
            const allFiles = [...uvprojFiles, ...uvprojxFiles];

            if (allFiles.length === 0) {
                showMessage('工作区内没有找到 Keil 工程文件。', 'info');
                return;
            }

            if (allFiles.length === 1) {
                await openProjectWithValidation(prjExplorer, allFiles[0].fsPath);
            } else {
                const items = allFiles.map((file) => ({
                    label: vscode.workspace.asRelativePath(file),
                    description: file.fsPath,
                    uri: file
                }));
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: '请选择一个 Keil 工程文件'
                });
                if (selected) {
                    await openProjectWithValidation(prjExplorer, selected.uri.fsPath);
                }
            }
        } catch (error) {
            showMessage(`打开工程失败！错误信息: ${(error as Error).message}`, 'error');
        }
    }));

    subscriber.push(vscode.commands.registerCommand('project.close', (item: any) => prjExplorer.closeProject(item.prjID)));
    subscriber.push(vscode.commands.registerCommand('project.build', (item: any) => prjExplorer.getTarget(item)?.build()));
    subscriber.push(vscode.commands.registerCommand('project.rebuild', (item: any) => prjExplorer.getTarget(item)?.rebuild()));
    subscriber.push(vscode.commands.registerCommand('project.flash', (item: any) => prjExplorer.getTarget(item)?.flash()));
    subscriber.push(vscode.commands.registerCommand('item.copyValue', (item: any) => vscode.env.clipboard.writeText(item.tooltip || '')));
    subscriber.push(vscode.commands.registerCommand('project.switch', (item: any) => prjExplorer.switchTargetByProject(item)));
    subscriber.push(vscode.commands.registerCommand('project.active', (item: any) => prjExplorer.activeProject(item)));

    // 5. Auto-load any project found in the workspace
    prjExplorer.loadWorkspace();
}

export function deactivate() {
    console.log('---- keil-assistant-linux closed ----');
}
