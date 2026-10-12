import * as vscode from 'vscode';
import * as node_path from 'path';

/**
 * Detect whether a path uses Windows conventions
 * (drive letter, backslash separator, etc.)
 */
export function isWindowsPath(path: string): boolean {
    if (!path) return false;

    // 1. Drive letter form: C:\ or D:/
    // 2. Contains backslash (\) - common Windows path indicator
    const hasDriveLetter = /^[a-zA-Z]:[\\/]/.test(path);
    const hasBackslash = path.includes('\\');

    return hasDriveLetter || hasBackslash;
}

/**
 * Path conversion helpers that work with the active VSCode workspace.
 * All operations normalize separators so callers can mix '/' and '\'.
 */
export class PathUtils {
    static toRelativePath(absolutePath: string): string {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // Ensure the path is absolute
            if (!node_path.isAbsolute(absolutePath)) {
                return absolutePath;
            }

            // Unify separators to '/'
            const cleanPath = absolutePath.split(/[\\/]/).join("/");

            return node_path.relative(workspaceRoot, cleanPath);
        }
        return absolutePath;
    }

    static toAbsolutePath(relativePath: string): string {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // Unify separators
            const rel = relativePath.split(/[\\/]/).join("/");

            // Already absolute - return as-is
            if (node_path.isAbsolute(rel)) {
                return node_path.normalize(rel);
            }

            return node_path.join(workspaceRoot, rel);
        }
        return relativePath;
    }
}
