import { File } from '../../lib/node_utility/File';

/**
 * Common interface implemented by every node in the project tree view.
 * `getChildViews()` returns `undefined` for leaf nodes (no expand chevron).
 */
export interface IView {
    label: string;
    prjID: string;
    icons?: { light: string; dark: string };
    tooltip?: string;
    contextVal?: string;
    getChildViews(): IView[] | undefined;
}

export class Source implements IView {
    label: string;
    prjID: string;
    icons?: { light: string; dark: string; } | undefined;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'Source';

    readonly file: File;
    readonly enable: boolean;

    children: Source[] | undefined;

    constructor(pID: string, f: File, _enable = true) {
        this.prjID = pID;
        this.enable = _enable;
        this.file = f;
        this.label = this.file.name;
        this.tooltip = f.path;

        let iconName = '';
        if (f.IsFile() === false) {
            iconName = 'FileWarning_16x';
        } else if (_enable === false) {
            iconName = 'FileExclude_16x';
        } else {
            iconName = this.getIconBySuffix(f.suffix.toLowerCase());
        }

        this.icons = {
            dark: iconName,
            light: iconName
        };
    }

    private getIconBySuffix(suffix: string): string {
        switch (suffix) {
            case '.c':
                return 'CFile_16x';
            case '.h':
            case '.hpp':
            case '.hxx':
            case '.inc':
                return 'CPPHeaderFile_16x';
            case '.cpp':
            case '.c++':
            case '.cxx':
            case '.cc':
                return 'CPP_16x';
            case '.s':
            case '.a51':
            case '.asm':
                return 'AssemblerSourceFile_16x';
            case '.lib':
            case '.a':
                return 'Library_16x';
            default:
                return 'Text_16x';
        }
    }

    getChildViews(): IView[] | undefined {
        return this.children;
    }
}

export class FileGroup implements IView {
    label: string;
    prjID: string;
    tooltip?: string | undefined;
    contextVal?: string | undefined = 'FileGroup';
    icons?: { light: string; dark: string; };

    sources: Source[];

    constructor(pID: string, gName: string, disabled: boolean) {
        this.label = gName;
        this.prjID = pID;
        this.sources = [];
        this.tooltip = gName;
        const iconName = disabled ? 'FolderExclude_32x' : 'Folder_32x';
        this.icons = { light: iconName, dark: iconName };
    }

    getChildViews(): IView[] | undefined {
        return this.sources;
    }
}
