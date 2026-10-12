import * as vscode from 'vscode';

let collection: vscode.DiagnosticCollection | undefined;

/**
 * Initialize the singleton diagnostic collection. Should be called
 * exactly once during extension activation.
 */
export function initDiagnosticCollection(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
    if (!collection) {
        collection = vscode.languages.createDiagnosticCollection('KeilAssistantLinux');
        context.subscriptions.push(collection);
    }
    return collection;
}

/**
 * Returns the singleton diagnostic collection. Throws if the extension
 * hasn't been activated yet.
 */
export function getDiagnosticCollection(): vscode.DiagnosticCollection {
    if (!collection) {
        throw new Error('Diagnostic collection accessed before extension activation');
    }
    return collection;
}
