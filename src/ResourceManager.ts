import * as vscode from 'vscode';
import * as os from 'os';
import { File } from '../lib/node_utility/File';

let _instance: ResourceManager | undefined;

const dirList: string[] = [
    File.sep + 'bin',
    File.sep + 'res',
    File.sep + 'res' + File.sep + 'icons'
];

/**
 * Expand a leading `~` to the current user's home directory.
 * Wine rejects `~` in WINEPREFIX, so callers that pass the result to
 * a shell command must receive an absolute path.
 */
function expandHome(path: string): string {
    if (!path) return path;
    if (path === '~' || path.startsWith('~/') || path.startsWith('~\\')) {
        return path.replace('~', os.homedir());
    }
    return path;
}

export class ResourceManager {

    private extensionDir: File;
    private dirMap: Map<string, File>;
    private iconMap: Map<string, string>;

    private constructor(context: vscode.ExtensionContext) {
        this.extensionDir = new File(context.extensionPath);
        this.dirMap = new Map();
        this.iconMap = new Map();
        this.init();
    }

    static getInstance(context?: vscode.ExtensionContext): ResourceManager {
        if (_instance === undefined) {
            if (context) {
                _instance = new ResourceManager(context);
            } else {
                throw Error('context can\'t be undefined');
            }
        }
        return _instance;
    }

    private init() {
        // init dirs
        for (const path of dirList) {
            const f = new File(this.extensionDir.path + path);
            if (f.IsDir()) {
                this.dirMap.set(f.noSuffixName, f);
            }
        }

        // init icons
        const iconDir = this.dirMap.get('icons');
        if (iconDir) {
            for (const icon of iconDir.GetList([/\.svg$/i], File.EMPTY_FILTER)) {
                this.iconMap.set(icon.noSuffixName, icon.path);
            }
        }
    }

    private getAppConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('KeilAssistantLinux');
    }

    getBaseAutoReplacePath(): boolean {
        return this.getAppConfig().get<boolean>("Base.AutoReplacePath") || false;
    }

    getBuilderExe(): string {
        return this.dirMap.get('bin')?.path + File.sep + 'Uv4Caller.exe';
    }

    getC51UV4Path(): string {
        return this.getAppConfig().get<string>('C51.Uv4Path') || 'null';
    }

    getArmC251Path(): string {
        return this.getAppConfig().get<string>('C251.Uv4Path') || 'null';
    }

    getArmUV4Path(): string {
        return this.getAppConfig().get<string>('ARM.Uv4Path') || 'null';
    }

    getWinePath(): string {
        return this.getAppConfig().get<string>("Wine.Path") || 'wine';
    }

    getWinePrefixPath() {
        const raw = this.getAppConfig().get<string>("Wine.PrefixPath") || '~/.wine';
        return expandHome(raw);
    }

    getProjectExcludeList(): string[] {
        return this.getAppConfig().get<string[]>('Project.ExcludeList') || [];
    }

    getProjectFileLocationList(): string[] {
        return this.getAppConfig().get<string[]>('Project.FileLocationList') || [];
    }

    getFlashDevice() {
        return this.getAppConfig().get<string>("flash.device") || 'ST-LINK V2';
    }

    getSTFlashPath() {
        return this.getAppConfig().get<string>("flash.st-flashPath") || 'st-flash';
    }

    getOpenocdPath() {
        return this.getAppConfig().get<string>("flash.openocdPath") || 'openocd';
    }

    getOpenocdTargetCfgMap(): Record<string, string> {
        return this.getAppConfig().get<Record<string, string>>("flash.openocdTargetCfgMap") || {};
    }

    getIconByName(name: string): string | undefined {
        return this.iconMap.get(name);
    }
}