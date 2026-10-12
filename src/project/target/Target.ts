import * as vscode from 'vscode';
import * as event from 'events';
import * as fs from 'fs';
import * as node_path from 'path';

import { File } from '../../../lib/node_utility/File';
import { FileWatcher } from '../../../lib/node_utility/FileWatcher';
import { KeilProjectInfo, uVisonInfo } from '../keilProject';
import { IView, Source, FileGroup } from '../../ui/views';
import { isWindowsPath, PathUtils } from '../../util/pathUtils';
import { windowsPathToLinuxByWinePrefixPath } from '../../util/winePath';
import { ResourceManager } from '../../ResourceManager';
import { getDiagnosticCollection } from '../../ui/diagnostics';
import { TaskExecutor } from './taskExecutor';

/**
 * A single build target inside a Keil project (e.g. "Debug" / "Release"
 * for ARM, or one of the targets in a C51 project). Subclasses encode
 * the project family: C51, C251, or ARM.
 *
 * Subclasses are responsible for providing project-family-specific
 * metadata (include path, defines, system include directories, build
 * command, etc.). Everything that is shared between families lives in
 * this base class.
 */
export abstract class Target implements IView {

    prjID: string;
    label: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Target';
    icons?: { light: string; dark: string; } = {
        light: 'Class_16x',
        dark: 'Class_16x'
    };

    readonly targetName: string;

    protected _event: event.EventEmitter;
    protected project: KeilProjectInfo;
    protected cppConfigName: string;
    protected targetDOM: any;
    protected uvInfo: uVisonInfo;
    protected fGroups: FileGroup[];
    protected includes: Set<string>;
    protected defines: Set<string>;

    private uv4LogFile: File;
    private uv4LogLockFileWatcher: FileWatcher;

    constructor(prjInfo: KeilProjectInfo, uvInfo: uVisonInfo, targetDOM: any) {
        this._event = new event.EventEmitter();
        this.project = prjInfo;
        this.targetDOM = targetDOM;
        this.uvInfo = uvInfo;
        this.prjID = prjInfo.prjID;
        this.targetName = targetDOM['TargetName'];
        this.label = this.targetName;
        this.tooltip = this.targetName;
        this.cppConfigName = Target.buildCppConfigName(prjInfo.label, this.targetName);
        this.includes = new Set();
        this.defines = new Set();
        this.fGroups = [];
        this.uv4LogFile = new File(node_path.join(this.project.projectStorageDir.path, 'uv4.log'));
        this.uv4LogLockFileWatcher = new FileWatcher(new File(this.uv4LogFile.path + '.lock'));

        if (!this.uv4LogLockFileWatcher.file.IsFile()) {
            this.uv4LogLockFileWatcher.file.Write('');
        }

        this.uv4LogLockFileWatcher.Watch();
        this.uv4LogLockFileWatcher.OnChanged = () => this.updateSourceRefs();
        this.uv4LogLockFileWatcher.on('error', () => {
            this.uv4LogLockFileWatcher.Close();
            if (!this.uv4LogLockFileWatcher.file.IsFile()) {
                this.uv4LogLockFileWatcher.file.Write('');
            }
            this.uv4LogLockFileWatcher.Watch();
        });
    }

    // ----- Abstract members every subclass must provide -----

    /** Validate that this target is compatible with the chosen subclass. */
    protected abstract checkProject(target: any): Error | undefined;

    /** Path string (semicolon-separated) of user include directories. */
    protected abstract getIncString(target: any): string;

    /** String of user preprocessor defines (comma- or whitespace-separated). */
    protected abstract getDefineString(target: any): string;

    /** Additional defines added by the toolchain itself. */
    protected abstract getSysDefines(target: any): string[];

    /** Raw `<Group>` array from the .uvproj file. */
    protected abstract getGroups(target: any): any[];

    /** Built-in include paths shipped with the toolchain (e.g. ARMCC/include). */
    protected abstract getSystemIncludes(target: any): string[] | undefined;

    /** Absolute path to the UV4.exe used for builds (wine-style path). */
    protected abstract getUv4Path(): string;

    /** Number of parallel jobs to use for this toolchain. */
    protected abstract getJobCount(): number;

    /** Build a single line of the build command. `action` is `-b` or `-r`. */
    protected buildCommandLine(action: '-b' | '-r'): string {
        return `\${uv4Path} ${action} \${prjPath} -j${this.getJobCount()} -t \${targetName}`;
    }

    /** Command used to flash the device. Returns the raw args plus a flag
     *  indicating whether the command needs the Wine + Uv4Caller wrapper
     *  (e.g. KEIL5 MDK) or runs as a plain shell command (e.g. st-flash). */
    protected abstract getFlashCommand(): { useWine: boolean; args: string[] };

    /** Regex matching a single diagnostic line in the build log. */
    protected getDiagnosticRegex(): RegExp {
        // Default: C51 / C251 style: "FILE(LINE): error/warning: #CODE: message"
        return /^([^()]+)\(([\d]+)\):\s+(error|warning):\s+(#\d+):\s+(.+)$/i;
    }

    // ----- Methods with sensible defaults that subclasses may override -----

    /**
     * Locate the produced .hex / .bin file. Default implementation looks
     * inside the configured output folder; targets that don't produce a
     * flashable image can leave this alone.
     */
    protected getOutputHexFile(target: any): File | undefined {
        const folderName = this.getOutputFolder(target);
        if (!folderName) {
            return undefined;
        }
        const outputDirectory = this.project.toAbsolutePath(folderName);
        const outDir = target['TargetOption']['TargetCommonOption']['OutputName'];
        const fileNoExt = outputDirectory + '/' + outDir;

        const hexFile = fileNoExt + '.hex';
        if (fs.existsSync(hexFile)) {
            return File.fromArray([hexFile]);
        }

        return undefined;
    }

    protected findOpenocdScriptRoot(): string | undefined {
        const candidates = [
            '/usr/share/openocd/scripts',        // Arch / Debian / Ubuntu
            '/usr/local/share/openocd/scripts',  // 源码编译默认
            '/usr/share/openocd',                // 某些发行版
            '/opt/openocd/share/openocd/scripts',
        ];

        for (const dir of candidates) {
            if (
                fs.existsSync(node_path.join(dir, 'target')) &&
                fs.existsSync(node_path.join(dir, 'interface'))
            ) {
                return dir;
            }
        }
        return undefined;
    }

    protected matchOpenocdTargetCfg(
        device: string,
        map: Record<string, string>
    ): string | undefined {
        const d = device.toUpperCase();

        // 1. 精确匹配（key 无 *）
        for (const [key, cfg] of Object.entries(map)) {
            if (key.endsWith('*')) continue;
            if (d === key.toUpperCase()) {
                return cfg;
            }
        }

        // 2. 前缀通配（key 末尾有 *），按 key 长度降序
        const wildcardKeys = Object.keys(map)
            .filter(k => k.endsWith('*'))
            .sort((a, b) => b.length - a.length);

        for (const key of wildcardKeys) {
            const prefix = key.slice(0, -1).toUpperCase();
            if (d.startsWith(prefix)) {
                return map[key];
            }
        }

        return undefined;
    }

    /**
     * Placeholder for the future OpenOCD config-file generator. Returns
     * `undefined` for all current toolchains (ST-LINK is handled via
     * `st-flash` instead).
     */
    protected getOpenocdWriteCfgFile(target: any): File | undefined {
        const device_name = target['TargetOption']['TargetCommonOption']['Device'];
        const openocdTargetCfgMap = ResourceManager.getInstance().getOpenocdTargetCfgMap();

        if (!device_name || !openocdTargetCfgMap) {
            return undefined;
        }

        // 1. 匹配 cfg 相对路径，如 "target/stm32f0x.cfg"
        const cfgRelPath = this.matchOpenocdTargetCfg(device_name, openocdTargetCfgMap);
        if (!cfgRelPath) {
            return undefined;
        }

        // 2. 如果是绝对路径，直接校验
        if (node_path.isAbsolute(cfgRelPath)) {
            return fs.existsSync(cfgRelPath) ? File.fromArray([cfgRelPath]) : undefined;
        }

        // 3. 相对路径：拼接 OpenOCD 脚本根目录后校验
        const scriptRoot = this.findOpenocdScriptRoot();
        if (!scriptRoot) {
            return undefined;
        }

        const cfgAbsPath = node_path.join(scriptRoot, cfgRelPath);
        if (!fs.existsSync(cfgAbsPath)) {
            return undefined;
        }

        return File.fromArray([cfgAbsPath]);
    }

    /** Output directory declared in the .uvproj file. C51/C251 return undefined. */
    protected getOutputFolder(_target: any): string | undefined {
        return undefined;
    }

    /** Parse .d (dependency) file lines. C51/C251 have no such files. */
    protected parseRefLines(_target: any, _lines: string[]): string[] {
        return [];
    }

    // ----- Concrete shared behaviour -----

    /** Construct a stable C/C++ configuration name for IntelliSense. */
    private static sanitizeConfigNamePart(raw: string): string {
        return raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    }

    private static buildCppConfigName(projectLabel: string, targetName: string): string {
        const projectPart = Target.sanitizeConfigNamePart(projectLabel);
        const targetPart = Target.sanitizeConfigNamePart(targetName);

        if (projectPart && targetPart) {
            return `${projectPart}_${targetPart}`;
        }
        return projectPart || targetPart || 'default';
    }

    on(event: 'dataChanged', listener: () => void): void;
    on(event: any, listener: () => void): void {
        this._event.on(event, listener);
    }

    private getDefCppProperties(): any {
        return {
            configurations: [
                {
                    name: this.cppConfigName,
                    includePath: undefined,
                    defines: undefined,
                    intelliSenseMode: '${default}'
                }
            ],
            version: 4
        };
    }

    private updateCppProperties() {
        // c_cpp_properties.json lives under the workspace's .vscode/ for the
        // C/C++ extension to pick it up automatically. Falls back to the
        // project storage dir if the workspace directory can't be created.
        let vscodeDir: string;
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            vscodeDir = node_path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.vscode');
        } else {
            vscodeDir = node_path.join(this.project.uvprjFile.dir, '.vscode');
        }

        try {
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
            }
        } catch (error) {
            this.project.logger.log(`[ERROR] Failed to create .vscode directory at ${vscodeDir}: ${error}`);
            vscodeDir = this.project.projectStorageDir.path;
        }

        const proFile = new File(node_path.join(vscodeDir, 'c_cpp_properties.json'));
        let obj: any;

        if (proFile.IsFile()) {
            try {
                obj = JSON.parse(proFile.Read());
            } catch (error) {
                this.project.logger.log(error);
                obj = this.getDefCppProperties();
            }
        } else {
            obj = this.getDefCppProperties();
        }
        const configList: any[] = Array.isArray(obj['configurations']) ? obj['configurations'] : [];
        obj['configurations'] = configList;
        const legacyIndex = configList.findIndex((conf) => conf.name === this.targetName);
        let index = configList.findIndex((conf) => conf.name === this.cppConfigName);
        if (index === -1 && legacyIndex !== -1) {
            index = legacyIndex;
            configList[index]['name'] = this.cppConfigName; // migrate legacy name to avoid collisions
        } else if (index !== -1 && legacyIndex !== -1 && legacyIndex !== index) {
            configList.splice(legacyIndex, 1); // remove redundant legacy entry
        }

        if (index === -1) {
            configList.push({
                name: this.cppConfigName,
                includePath: Array.from(this.includes).concat(['${default}']),
                defines: Array.from(this.defines),
                intelliSenseMode: '${default}'
            });
        } else {
            configList[index]['includePath'] = Array.from(this.includes).concat(['${default}']);
            configList[index]['defines'] = Array.from(this.defines);
        }

        proFile.Write(JSON.stringify(obj, undefined, 4));
    }

    public async applyCppConfigurationSelection(): Promise<void> {
        try {
            this.updateCppProperties();
            await vscode.commands.executeCommand('C_Cpp.ConfigurationSelect', this.cppConfigName);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.project.logger.log(`[WARN] Failed to select C/C++ configuration '${this.cppConfigName}': ${msg}`);
        }
    }

    async load(): Promise<void> {
        const err = this.checkProject(this.targetDOM);
        if (err) { throw err; }

        const incListStr = this.getIncString(this.targetDOM);
        const defineListStr = this.getDefineString(this.targetDOM);
        const _groups: any = this.getGroups(this.targetDOM);
        const sysIncludes = this.getSystemIncludes(this.targetDOM);

        // Includes (user + system)
        this.includes.clear();
        let incList = incListStr.split(';');
        if (sysIncludes) {
            incList = incList.concat(sysIncludes);
        }
        incList.forEach((path) => {
            const realPath = path.trim().replace(/\\/g, '/');
            if (realPath !== '') {
                this.includes.add(this.project.toAbsolutePath(realPath));
            }
        });

        // Defines (user)
        this.defines.clear();
        defineListStr.split(/,|\s+/).forEach((define) => {
            if (define.trim() !== '') {
                this.defines.add(define);
            }
        });

        // Defines (system)
        this.getSysDefines(this.targetDOM).forEach((define) => {
            this.defines.add(define);
        });

        // File groups
        this.fGroups = [];
        const groups: any[] = Array.isArray(_groups) ? _groups : [_groups];

        for (const group of groups) {
            if (group['Files'] === undefined) {
                continue;
            }

            let isGroupExcluded = false;
            let fileList: any[];

            if (group['GroupOption']) {
                const gOption = group['GroupOption']['CommonProperty'];
                if (gOption && gOption['IncludeInBuild'] === '0') {
                    isGroupExcluded = true;
                }
            }

            const nGrp = new FileGroup(this.prjID, group['GroupName'], isGroupExcluded);

            if (Array.isArray(group['Files'])) {
                fileList = [];
                for (const files of group['Files']) {
                    if (Array.isArray(files['File'])) {
                        fileList = fileList.concat(files['File']);
                    } else if (files['File'] !== undefined) {
                        fileList.push(files['File']);
                    }
                }
            } else {
                if (Array.isArray(group['Files']['File'])) {
                    fileList = group['Files']['File'];
                } else if (group['Files']['File'] !== undefined) {
                    fileList = [group['Files']['File']];
                } else {
                    fileList = [];
                }
            }

            for (const file of fileList) {
                const f = new File(this.project.toAbsolutePath(file['FilePath'].replace(/\\/g, '/')));

                let isFileExcluded = isGroupExcluded;
                if (!isFileExcluded && file['FileOption']) {
                    const fOption = file['FileOption']['CommonProperty'];
                    if (fOption && fOption['IncludeInBuild'] === '0') {
                        isFileExcluded = true;
                    }
                }

                const nFile = new Source(this.prjID, f, !isFileExcluded);
                this.includes.add(f.dir);
                nGrp.sources.push(nFile);
            }

            this.fGroups.push(nGrp);
        }

        this.updateCppProperties();
        this.updateSourceRefs();
    }

    // ----- Build / flash / diagnostics -----

    build() {
        this.runWineTask('build', this.buildCommandArgs('-b'));
    }

    rebuild() {
        this.runWineTask('rebuild', this.buildCommandArgs('-r'));
    }

    flash() {
        const spec = this.getFlashCommand();
        if (spec.useWine) {
            this.runWineTask('flash', spec.args);
        } else {
            this.runShellTask('flash', spec.args);
        }
    }

    private buildCommandArgs(action: '-b' | '-r'): string[] {
        return [
            '--uv4Path', this.getUv4Path(),
            '--prjPath', this.project.uvprjFile.path,
            '--targetName', this.targetName,
            '-c', this.buildCommandLine(action)
        ];
    }

    private runWineTask(name: 'build' | 'rebuild' | 'flash', args: string[]) {
        TaskExecutor.execute({
            name,
            args,
            cwd: this.project.uvprjFile.dir,
            diagnosticCollection: getDiagnosticCollection(),
            prjID: this.prjID,
            targetName: this.targetName,
            logger: this.project.logger
        }, true);
    }

    private runShellTask(name: 'flash', args: string[]) {
        TaskExecutor.execute({
            name,
            args,
            cwd: this.project.uvprjFile.dir,
            diagnosticCollection: getDiagnosticCollection(),
            prjID: this.prjID,
            targetName: this.targetName,
            logger: this.project.logger
        }, false);
    }

    updateSourceRefs() {
        const rePath = this.getOutputFolder(this.targetDOM);
        if (rePath) {
            const outPath = this.project.toAbsolutePath(rePath);
            const winePrefix = ResourceManager.getInstance().getWinePrefixPath();
            this.fGroups.forEach((group) => {
                group.sources.forEach((source) => {
                    if (source.enable) {
                        const refFile = File.fromArray([
                            outPath,
                            (source.file.noSuffixName + '.d').toLowerCase()
                        ]);
                        if (refFile.IsFile()) {
                            const refFileList = this.parseRefLines(this.targetDOM, refFile.Read().split(/\r\n|\n/))
                                .map((line) => {
                                    if (isWindowsPath(line.replace(/\\/g, '/'))) {
                                        return windowsPathToLinuxByWinePrefixPath(line, winePrefix);
                                    }
                                    return this.project.toAbsolutePath(line);
                                });
                            source.children = refFileList.map((refFilePath) => {
                                return new Source(source.prjID, new File(refFilePath));
                            });
                        }
                    }
                });
            });
            this._event.emit('dataChanged');
        }
    }

    close() {
        this.uv4LogLockFileWatcher.Close();
    }

    getChildViews(): IView[] | undefined {
        return this.fGroups;
    }

    protected getFilePath(filePath: string): string {
        return PathUtils.toAbsolutePath(PathUtils.toRelativePath(filePath.replace(/\\/g, '/')));
    }

    /**
     * Parse the build log and publish diagnostics to VSCode's Problems panel.
     * Called automatically by the extension when a build task ends.
     */
    public async processDiagnostics(): Promise<void> {
        this.project.logger.log(`[INFO] Target '${this.targetName}': Processing diagnostics from log file '${this.uv4LogFile.path}'...`);

        let logContent: string;
        try {
            logContent = this.uv4LogFile.Read();
        } catch (e: any) {
            this.project.logger.log(`[ERROR] Failed to read log file '${this.uv4LogFile.path}': ${e.message}`);
            return;
        }

        if (!logContent) {
            this.project.logger.log(`[INFO] Log file '${this.uv4LogFile.path}' is empty.`);
            return;
        }

        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();
        const lines = logContent.split(/\r?\n/);
        const regex = this.getDiagnosticRegex();

        this.project.logger.log(`[DEBUG] Using regex for ${this.constructor.name}: ${regex}`);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = regex.exec(line);

            if (match) {
                const rawRelativePath = match[1];
                const lineNumber = parseInt(match[2], 10);
                const severityWord = match[3].toLowerCase();
                const errorCode = match[4];
                const message = match[5];
                const fullMessage = `${errorCode}: ${message}`;

                const severity = severityWord === 'error'
                    ? vscode.DiagnosticSeverity.Error
                    : vscode.DiagnosticSeverity.Warning;

                if (rawRelativePath && !isNaN(lineNumber) && lineNumber > 0) {
                    try {
                        const absolutePath = this.project.toAbsolutePath(rawRelativePath);
                        const uri = vscode.Uri.file(absolutePath);
                        const range = new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 100);

                        const diagnostic = new vscode.Diagnostic(range, fullMessage, severity);
                        diagnostic.source = `Keil ${this.constructor.name.replace('Target', '')} Compiler`;

                        if (!diagnosticsMap.has(uri.toString())) {
                            diagnosticsMap.set(uri.toString(), []);
                        }
                        diagnosticsMap.get(uri.toString())?.push(diagnostic);
                        this.project.logger.log(`[DEBUG] Found diagnostic: ${uri.fsPath}:${lineNumber} - ${fullMessage}`);
                    } catch (e: any) {
                        this.project.logger.log(`[ERROR] Error processing diagnostic line '${line}': ${e.message}`);
                    }
                } else {
                    this.project.logger.log(`[WARN] Could not parse diagnostic from line: ${line}`);
                }
            }
        }

        const collection = getDiagnosticCollection();
        diagnosticsMap.forEach((diags, uriString) => {
            collection.set(vscode.Uri.parse(uriString), diags);
        });

        if (diagnosticsMap.size > 0) {
            this.project.logger.log(`[INFO] Published diagnostics for ${diagnosticsMap.size} file(s).`);
        } else {
            this.project.logger.log(`[INFO] No new diagnostics found in log file.`);
        }
    }
}
