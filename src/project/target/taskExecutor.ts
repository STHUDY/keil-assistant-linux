import * as vscode from 'vscode';
import * as node_path from 'path';

import { ResourceManager } from '../../ResourceManager';

export interface TaskExecutionParams {
    /** Name used for the VSCode task and as a fallback terminal name. */
    name: 'build' | 'rebuild' | 'flash';
    /** Raw arguments to pass to the program (e.g. ['--uv4Path', ..., '-c', '...']). */
    args: string[];
    /** Working directory for the spawned process. */
    cwd: string;
    /** Diagnostic collection to clear before starting a new build. */
    diagnosticCollection: vscode.DiagnosticCollection;
    /** Project id and target name embedded in the task definition. */
    prjID: string;
    targetName: string;
    /** Optional callback invoked after the task is scheduled. */
    onScheduled?: () => void;
    /** Logger used to record debug information about task execution. */
    logger: Console;
}

/**
 * Build a VSCode Task for a target operation and either execute it (when a
 * workspace is open) or fall back to launching an external terminal.
 *
 * Two execution modes are supported:
 *
 *  - **Wine mode** (`useWine: true`): prepends the configured `wine` binary
 *    and WINEPREFIX to invoke a Windows .exe. Output is passed through `sed`
 *    to convert backslashes to forward slashes when auto-replace is on.
 *
 *  - **Shell mode** (`useWine: false`): runs the command as-is through the
 *    user's shell. Used for native Linux tools like `st-flash`.
 */
export class TaskExecutor {

    /**
     * Quote a command token with single quotes if it contains spaces and
     * the quote char is not already present.
     */
    static quoteString(str: string, quote = '\''): string {
        return (str.includes(' ') && !str.includes(quote)) ? (quote + str + quote) : str;
    }

    static buildTask(params: TaskExecutionParams, useWine: boolean): vscode.Task {
        const taskDefinition = {
            type: 'keil-task',
            prjID: params.prjID,
            targetName: params.targetName
        };
        const task = new vscode.Task(
            taskDefinition,
            vscode.TaskScope.Workspace,
            params.name,
            useWine ? 'keil-assistant-linux' : 'shell'
        );
        task.isBackground = false;
        task.execution = new vscode.ShellExecution(
            TaskExecutor.buildCommandLine(params, useWine),
            { cwd: params.cwd }
        );
        task.presentationOptions = {
            echo: false,
            focus: false,
            clear: true
        };
        return task;
    }

    static buildCommandLine(params: TaskExecutionParams, useWine: boolean): string {
        const resManager = ResourceManager.getInstance();
        const args = ['-o', node_path.join(params.cwd, 'uv4.log'), ...params.args];

        if (useWine) {
            const winePrefix = resManager.getWinePrefixPath();
            const prefixPart = winePrefix !== '' ? `WINEPREFIX="${winePrefix}" ` : '';
            const invokePrefix = `WINEDEBUG=-all ${prefixPart}${resManager.getWinePath()} `;
            const builderExe = resManager.getBuilderExe();
            const filterSuffix = resManager.getBaseAutoReplacePath()
                ? ` 2>&1 | sed -u 's/\\\\/\\//g'`
                : '';

            return invokePrefix
                + this.quoteString(builderExe, '\'')
                + ' '
                + args.map((arg) => this.quoteString(arg, '\'')).join(' ')
                + filterSuffix;
        }

        return args.map((arg) => this.quoteString(arg, '')).join(' ');
    }

    static execute(params: TaskExecutionParams, useWine: boolean): void {
        // Clear any previously-published diagnostics for this collection.
        // Granular per-project clearing could be added if needed.
        params.diagnosticCollection.clear();

        // Log the CWD for debugging path resolution issues
        params.logger.log(`[DEBUG] Task CWD for '${params.name}': '${params.cwd}'`);

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const task = TaskExecutor.buildTask(params, useWine);
            vscode.tasks.executeTask(task);
            params.onScheduled?.();
        } else {
            // Fallback: when no workspace is open, use an external terminal
            const commandLine = TaskExecutor.buildCommandLine(params, useWine);
            TaskExecutor.fallbackToTerminal(params.name, commandLine);
            params.onScheduled?.();
        }
    }

    private static fallbackToTerminal(name: string, commandLine: string): void {
        const index = vscode.window.terminals.findIndex((ter) => ter.name === name);
        if (index !== -1) {
            vscode.window.terminals[index].hide();
            vscode.window.terminals[index].dispose();
        }

        const terminal = vscode.window.createTerminal(name);
        terminal.show();
        terminal.sendText(commandLine);
    }
}
