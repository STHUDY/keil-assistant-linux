import * as vscode from 'vscode';

import { ResourceManager } from './ResourceManager';
import { showMessage } from './ui/notifier';
import { initDiagnosticCollection } from './ui/diagnostics';
import { ProjectExplorer } from './ui/projectExplorer';

function classifyProject(xmlContent: string): string | undefined {
    const TargetOption = xmlContent.includes('TargetOption');
    if (!TargetOption) {
        return undefined;
    }

    if (xmlContent.includes('Target51') && xmlContent.includes('C51')) {
        return 'C51';
    } else if (xmlContent.includes('Target251') && xmlContent.includes('C251')) {
        return 'C251';
    } else if (xmlContent.includes('TargetCommonOption') || xmlContent.includes('TargetArmAds')) {
        return 'ARM';
    }

    return undefined;
}

/**
 * Open a single .uvproj / .uvprojx file via the project explorer. If
 * the matching UV4 path isn't configured, show a helpful error and
 * abort before attempting to load the project.
 */
async function openProjectWithValidation(
    prjExplorer: ProjectExplorer,
    uvPrjPath: string
): Promise<void> {
    try {
        const xmlContent = (await vscode.workspace.fs.readFile(vscode.Uri.file(uvPrjPath))).toString();
        const projectType = classifyProject(xmlContent);

        if (projectType == 'C51') {
            const c51Path = ResourceManager.getInstance().getC51UV4Path();
            if (c51Path === 'null') {
                showMessage('请先在设置中配置 C51 的 UV4 路径！', 'error');
                return;
            }
        } else if (projectType == 'C251') {
            const c251Path = ResourceManager.getInstance().getArmC251Path();
            if (c251Path === 'null') {
                showMessage('请先在设置中配置 C251 的 UV4 路径！', 'error');
                return;
            }
        } else if (projectType == 'ARM') {
            const armPath = ResourceManager.getInstance().getArmUV4Path();
            if (armPath === 'null') {
                showMessage('请先在设置中配置 ARM 的 UV4 路径！', 'error');
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
