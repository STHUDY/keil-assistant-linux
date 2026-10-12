import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as xml2js from 'xml2js';
import * as event from 'events';
import * as fs from 'fs';
import * as node_path from 'path';

import { File } from '../../lib/node_utility/File';
import { FileWatcher } from '../../lib/node_utility/FileWatcher';
import { Time } from '../../lib/node_utility/Time';
import { showMessage } from '../ui/notifier';
import { IView } from '../ui/views';
import { Target } from './target/Target';

function getMD5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
}

export interface uVisonInfo {
    schemaVersion: string | undefined;
}

/**
 * Project-level information exposed to {@link Target} instances.
 * Targets only need read-only access to project metadata, so we use an
 * interface rather than exposing the whole {@link KeilProject} class.
 */
export interface KeilProjectInfo {
    prjID: string;
    label: string;
    projectStorageDir: File;
    uvprjFile: File;
    logger: Console;
    toAbsolutePath(rePath: string): string;
}

export class KeilProject implements IView, KeilProjectInfo {
    prjID: string;
    label: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Project';
    icons?: { light: string; dark: string; } = {
        light: 'DeactiveApplication_16x',
        dark: 'DeactiveApplication_16x'
    };

    projectStorageDir: File;
    uvprjFile: File;
    logger: Console;

    uVsionFileInfo: uVisonInfo;

    private activeTargetName: string | undefined;
    private prevUpdateTime: number | undefined;

    protected _event: event.EventEmitter;
    protected watcher: FileWatcher;
    protected targetList: Target[];
    protected files: any[] = [];

    constructor(_uvprjFile: File, extensionContext: vscode.ExtensionContext) {
        this._event = new event.EventEmitter();
        this.uVsionFileInfo = <uVisonInfo>{};
        this.targetList = [];
        this.uvprjFile = _uvprjFile;
        this.prjID = getMD5(_uvprjFile.path);

        // Per-project global storage directory, keyed by MD5 of project path
        const globalStoragePath = extensionContext.globalStorageUri.fsPath;
        this.projectStorageDir = new File(node_path.join(globalStoragePath, this.prjID));
        try {
            if (!fs.existsSync(this.projectStorageDir.path)) {
                fs.mkdirSync(this.projectStorageDir.path, { recursive: true });
            }
        } catch (error) {
            console.error(
                `Keil Assistant Linux: Failed to create project storage directory at ${this.projectStorageDir.path}`,
                error
            );
        }

        const logPath = node_path.join(this.projectStorageDir.path, 'keil-assistant-linux.log');
        this.logger = new console.Console(fs.createWriteStream(logPath, { flags: 'a+' }));
        this.watcher = new FileWatcher(this.uvprjFile);
        this.label = _uvprjFile.noSuffixName;
        this.tooltip = _uvprjFile.path;
        this.logger.log(`[info] Log for project ${this.label} (${this.prjID}) at : ${Time.GetInstance().GetTimeStamp()}\r\n`);
        this.logger.log(`[info] Project-specific storage: ${this.projectStorageDir.path}`);
        this.watcher.OnChanged = () => {
            if (this.prevUpdateTime === undefined ||
                this.prevUpdateTime + 2000 < Date.now()) {
                this.prevUpdateTime = Date.now();
                setTimeout(() => this.onReload(), 300);
            }
        };
        this.watcher.Watch();
    }

    on(event: 'dataChanged', listener: () => void): void;
    on(event: any, listener: () => void): void {
        this._event.on(event, listener);
    }

    private async onReload() {
        try {
            this.targetList.forEach((target) => target.close());
            this.targetList = [];
            await this.load();
            this.notifyUpdateView();
        } catch (err) {
            if (err && typeof err === 'object' && 'code' in err && err.code === 'EBUSY') {
                this.logger.log(`[Warn] uVision project file '${this.uvprjFile.name}' is locked !, delay 500 ms and retry !`);
                setTimeout(() => this.onReload(), 500);
            } else {
                const message = err instanceof Error ? err.message : String(err);
                showMessage(`reload project failed !, msg: ${message}`, 'error');
            }
        }
    }

    async load() {
        const parser = new xml2js.Parser({ explicitArray: false });
        const doc = await parser.parseStringPromise({ toString: () => { return this.uvprjFile.Read(); } });
        const targets = doc['Project']['Targets']['Target'];

        // init uVsion info
        this.uVsionFileInfo.schemaVersion = doc['Project']['SchemaVersion'];

        if (Array.isArray(targets)) {
            for (const target of targets) {
                const newTarget = await Target.getInstance(this, this.uVsionFileInfo, target);
                this.targetList.push(newTarget);
            }
        } else {
            const newTarget = await Target.getInstance(this, this.uVsionFileInfo, targets);
            this.targetList.push(newTarget);
        }

        for (const target of this.targetList) {
            await target.load();
            target.on('dataChanged', () => this.notifyUpdateView());
        }
    }

    notifyUpdateView() {
        this._event.emit('dataChanged');
    }

    close() {
        this.watcher.Close();
        this.targetList.forEach((target) => target.close());
        this.logger.log('[info] project closed: ' + this.label);
    }

    toAbsolutePath(rePath: string): string {
        // Unify separators
        const path = rePath.split(/[\\/]/).join(node_path.sep);

        // Already absolute
        if (node_path.isAbsolute(path)) {
            return node_path.normalize(path);
        }

        // Otherwise join with project directory
        return node_path.normalize(node_path.join(this.uvprjFile.dir, path));
    }

    active() {
        this.icons = { light: 'ActiveApplication_16x', dark: 'ActiveApplication_16x' };
    }

    deactive() {
        this.icons = { light: 'DeactiveApplication_16x', dark: 'DeactiveApplication_16x' };
    }

    getTargetByName(name: string): Target | undefined {
        const index = this.targetList.findIndex((t) => { return t.targetName === name; });
        if (index !== -1) {
            return this.targetList[index];
        }
        return undefined;
    }

    async setActiveTarget(tName: string) {
        const target = this.getTargetByName(tName);
        if (!target) {
            return;
        }
        const hasChanged = tName !== this.activeTargetName;
        this.activeTargetName = tName;
        await target.applyCppConfigurationSelection();
        if (hasChanged) {
            this.notifyUpdateView();
        }
    }

    getActiveTarget(): Target | undefined {
        if (this.activeTargetName) {
            return this.getTargetByName(this.activeTargetName);
        } else if (this.targetList.length > 0) {
            return this.targetList[0];
        }
        return undefined;
    }

    async applyActiveCppConfiguration(): Promise<void> {
        const activeTarget = this.getActiveTarget();
        if (!activeTarget) {
            return;
        }
        if (!this.activeTargetName) {
            this.activeTargetName = activeTarget.targetName;
            this.notifyUpdateView();
        }
        await activeTarget.applyCppConfigurationSelection();
    }

    getChildViews(): IView[] | undefined {
        if (this.activeTargetName) {
            const target = this.getTargetByName(this.activeTargetName);
            if (target) {
                return [target];
            }
        }

        if (this.targetList.length > 0) {
            return [this.targetList[0]];
        }

        return undefined;
    }

    getTargets(): Target[] {
        return this.targetList;
    }
}
