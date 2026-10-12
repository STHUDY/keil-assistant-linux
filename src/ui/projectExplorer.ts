import * as vscode from 'vscode';
import * as node_path from 'path';

import { File } from '../../lib/node_utility/File';
import { ResourceManager } from '../ResourceManager';
import { showMessage } from './notifier';
import { IView, Source } from './views';
import { KeilProject } from '../project/keilProject';
import { Target } from '../project/target/Target';

/**
 * Owns the "Keil uVision Project" tree view: discovers projects, opens
 * them on demand, switches the active project/target, and exposes the
 * build/rebuild/flash status bar items.
 */
export class ProjectExplorer implements vscode.TreeDataProvider<IView>, vscode.Disposable {

    private ItemClickCommand = 'Item.Click';

    onDidChangeTreeData: vscode.Event<IView | undefined | null>;
    private viewEvent: vscode.EventEmitter<IView | undefined | null>;

    private prjList: Map<string, KeilProject>;
    private currentActiveProject: KeilProject | undefined;
    private buildStatusBarItem: vscode.StatusBarItem;
    private rebuildStatusBarItem: vscode.StatusBarItem;
    private flashStatusbarItem: vscode.StatusBarItem;

    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.prjList = new Map();
        this.viewEvent = new vscode.EventEmitter<IView | undefined | null>();
        this.onDidChangeTreeData = this.viewEvent.event;
        context.subscriptions.push(vscode.window.registerTreeDataProvider('project', this));
        context.subscriptions.push(vscode.commands.registerCommand(this.ItemClickCommand, (item: IView) => this.onItemClick(item)));

        this.buildStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -8);
        this.buildStatusBarItem.text = '$(gear) Build';
        this.buildStatusBarItem.tooltip = '编译当前 Keil 工程';
        this.buildStatusBarItem.command = 'keil.build';

        this.rebuildStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -9);
        this.rebuildStatusBarItem.text = '$(refresh) Rebuild';
        this.rebuildStatusBarItem.tooltip = '重新编译当前 Keil 工程';
        this.rebuildStatusBarItem.command = 'keil.rebuild';

        this.flashStatusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -10);
        this.flashStatusbarItem.text = '$(cloud-upload) Flash';
        this.flashStatusbarItem.tooltip = '将程序烧录到目标设备';
        this.flashStatusbarItem.command = 'project.flash';

        this.updateStatusBarVisibility();
    }

    private updateStatusBarVisibility(): void {
        const hasActiveProject = this.currentActiveProject !== undefined;
        if (hasActiveProject) {
            this.buildStatusBarItem.show();
            this.rebuildStatusBarItem.show();
            this.flashStatusbarItem.show();
        } else {
            this.buildStatusBarItem.hide();
            this.rebuildStatusBarItem.hide();
            this.flashStatusbarItem.hide();
        }
    }

    /**
     * Scan the active workspace and the configured extra locations for
     * .uvproj / .uvprojx files, then prompt the user to open one if more
     * than one is found.
     */
    async loadWorkspace() {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }
        const excludeList = ResourceManager.getInstance().getProjectExcludeList();
        const uvprojFiles = await vscode.workspace.findFiles('**/*.uvproj', '**/node_modules/**');
        const uvprojxFiles = await vscode.workspace.findFiles('**/*.uvprojx', '**/node_modules/**');
        const allFiles = [...uvprojFiles, ...uvprojxFiles];

        // Collect all workspace roots (including a .code-workspace file root if any)
        const workspaceRoots: string[] = [];
        if (vscode.workspace.workspaceFile && /^file:/.test(vscode.workspace.workspaceFile.toString())) {
            workspaceRoots.push(node_path.dirname(vscode.workspace.workspaceFile.fsPath));
        }
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                workspaceRoots.push(folder.uri.fsPath);
            }
        }
        const normalizedRoots = Array.from(new Set(workspaceRoots.map((r) => node_path.normalize(r))));

        // Resolve the configured extra locations, both relative and absolute
        const rawLocations = ResourceManager.getInstance().getProjectFileLocationList();
        const resolvedLocationPaths: string[] = [];
        for (const loc of rawLocations) {
            if (!loc || loc.trim() === '') continue;

            if (node_path.isAbsolute(loc)) {
                resolvedLocationPaths.push(node_path.normalize(loc));
            } else if (normalizedRoots.length > 0) {
                for (const root of normalizedRoots) {
                    resolvedLocationPaths.push(node_path.normalize(node_path.resolve(root, loc)));
                }
            } else {
                resolvedLocationPaths.push(node_path.normalize(loc));
            }
        }

        const locationFiles = resolvedLocationPaths
            .map((p) => new File(p))
            .flatMap((f) => {
                if (f.IsFile()) {
                    return /\.uvproj$/i.test(f.suffix) || /\.uvprojx$/i.test(f.suffix) ? [f] : [];
                }
                if (f.IsDir()) {
                    return f.GetAll([/\.uvproj$/i, /\.uvprojx$/i], undefined).filter((sub) => sub.IsFile());
                }
                return [];
            });

        const uvList = allFiles
            .map((uri) => uri.fsPath)
            .concat(locationFiles.map((f) => f.path))
            .filter((p, index, arr) => arr.indexOf(p) === index) // dedupe
            .map((p) => new File(p))
            .filter((f) => !excludeList.includes(f.name));

        if (uvList.length === 0) {
            return; // No Keil project in workspace - silent skip
        }

        if (uvList.length === 1) {
            try {
                await this.openProject(uvList[0].path);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                showMessage(`open project: '${uvList[0].name}' failed !, msg: ${message}`, 'error');
            }
            return;
        }

        const items = uvList.map((file) => ({
            label: vscode.workspace.asRelativePath(file.path, false),
            description: file.path,
            file
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '请选择一个 Keil 工程文件'
        });

        if (selected) {
            try {
                await this.openProject(selected.file.path);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                showMessage(`open project: '${selected.file.name}' failed !, msg: ${message}`, 'error');
            }
        }
    }

    async openProject(path: string): Promise<KeilProject | undefined> {
        const nPrj = new KeilProject(new File(path), this.extensionContext);
        if (!this.prjList.has(nPrj.prjID)) {
            await nPrj.load();
            nPrj.on('dataChanged', () => this.updateView());
            this.prjList.set(nPrj.prjID, nPrj);
            this.currentActiveProject?.deactive();
            this.currentActiveProject = nPrj;
            this.currentActiveProject.active();
            await this.currentActiveProject.applyActiveCppConfiguration();
            this.updateView();
            this.updateStatusBarVisibility();
            return nPrj;
        }
        return undefined;
    }

    async closeProject(pID: string) {
        const prj = this.prjList.get(pID);
        if (prj) {
            prj.deactive();
            prj.close();
            this.prjList.delete(pID);
            if (this.currentActiveProject?.prjID === pID) {
                this.currentActiveProject = undefined;
            }
            this.updateView();
            this.updateStatusBarVisibility();
        }
    }

    async activeProject(view: IView) {
        const project = this.prjList.get(view.prjID);
        if (project) {
            this.currentActiveProject?.deactive();
            this.currentActiveProject = project;
            this.currentActiveProject.active();
            await this.currentActiveProject.applyActiveCppConfiguration();
            this.updateView();
            this.updateStatusBarVisibility();
        }
    }

    async switchTargetByProject(view: IView) {
        const prj = this.prjList.get(view.prjID);
        if (prj) {
            const tList = prj.getTargets();
            const targetName = await vscode.window.showQuickPick(tList.map((ele) => ele.targetName), {
                canPickMany: false,
                placeHolder: 'please select a target name for keil project'
            });
            if (targetName) {
                if (this.currentActiveProject?.prjID !== prj.prjID) {
                    this.currentActiveProject?.deactive();
                    this.currentActiveProject = prj;
                    this.currentActiveProject.active();
                    this.updateStatusBarVisibility();
                }
                await prj.setActiveTarget(targetName);
                this.updateView();
            }
        }
    }

    getTarget(view?: IView): Target | undefined {
        if (view) {
            const prj = this.prjList.get(view.prjID);
            if (prj) {
                const targets = prj.getTargets();
                const index = targets.findIndex((target) => target.targetName === view.label);
                if (index !== -1) {
                    return targets[index];
                }
            }
        } else {
            if (this.currentActiveProject) {
                return this.currentActiveProject.getActiveTarget();
            } else {
                showMessage('Not found any active project !', 'warning');
            }
        }
        return undefined;
    }

    updateView() {
        this.viewEvent.fire(undefined);
    }

    //----------------------------------

    itemClickInfo: any = undefined;

    private async onItemClick(item: IView) {
        switch (item.contextVal) {
            case 'Source':
                {
                    const source = item as Source;
                    const file = new File(node_path.normalize(source.file.path));

                    if (file.IsFile()) {
                        let isPreview = true;
                        if (this.itemClickInfo &&
                            this.itemClickInfo.name === file.path &&
                            this.itemClickInfo.time + 260 > Date.now()) {
                            isPreview = false;
                        }
                        this.itemClickInfo = {
                            name: file.path,
                            time: Date.now()
                        };
                        vscode.window.showTextDocument(vscode.Uri.parse(file.ToUri()), { preview: isPreview });
                    } else {
                        showMessage(`Not found file: ${source.file.path}`, 'warning');
                    }
                }
                break;
            default:
                break;
        }
    }

    getTreeItem(element: IView): vscode.TreeItem | Thenable<vscode.TreeItem> {
        const res = new vscode.TreeItem(element.label);

        res.contextValue = element.contextVal;
        res.tooltip = element.tooltip;
        res.collapsibleState = element.getChildViews() === undefined
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Collapsed;

        if (element instanceof Source) {
            res.command = {
                title: element.label,
                command: this.ItemClickCommand,
                arguments: [element]
            };
        }

        if (element.icons) {
            const lightIconPath = ResourceManager.getInstance().getIconByName(element.icons.light);
            const darkIconPath = ResourceManager.getInstance().getIconByName(element.icons.dark);

            if (lightIconPath && darkIconPath) {
                try {
                    res.iconPath = {
                        light: vscode.Uri.file(lightIconPath),
                        dark: vscode.Uri.file(darkIconPath)
                    };
                } catch (e) {
                    console.error(`Error creating icon Uri for ${element.label}:`, e);
                }
            }
        }
        return res;
    }

    getChildren(element?: IView | undefined): vscode.ProviderResult<IView[]> {
        if (element === undefined) {
            return Array.from(this.prjList.values());
        }
        return element.getChildViews();
    }

    getCurrentActiveProject(): KeilProject | undefined {
        return this.currentActiveProject;
    }

    public getProjectById(prjID: string): KeilProject | undefined {
        return this.prjList.get(prjID);
    }

    dispose() {
        this.buildStatusBarItem.dispose();
        this.rebuildStatusBarItem.dispose();
        this.flashStatusbarItem.dispose();
        this.prjList.forEach((prj) => prj.close());
        this.prjList.clear();
        this.viewEvent.dispose();
    }
}
