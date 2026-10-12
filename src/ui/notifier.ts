import * as vscode from 'vscode';

// 消息防重复显示：2 秒内的相同消息不重复弹窗
const messageDebouncer = new Map<string, number>();
const DEBOUNCE_WINDOW_MS = 2000;

export type MessageType = 'info' | 'warning' | 'error';

/**
 * Show a VSCode notification with built-in de-duplication.
 * Identical (message, type) pairs within {@link DEBOUNCE_WINDOW_MS} are
 * collapsed to a single notification. When no action items are supplied
 * the notification auto-closes after `timeout` ms.
 */
export function showMessage(
    message: string,
    type: MessageType = 'info',
    timeout = 1000,
    items?: string[]
): Thenable<string | undefined> | undefined {
    const messageKey = `${message}-${type}`;
    const now = Date.now();

    const lastShowTime = messageDebouncer.get(messageKey);
    if (lastShowTime && (now - lastShowTime) < DEBOUNCE_WINDOW_MS) {
        return undefined;
    }

    messageDebouncer.set(messageKey, now);
    setTimeout(() => {
        messageDebouncer.delete(messageKey);
    }, DEBOUNCE_WINDOW_MS);

    const options = { modal: false };
    let promise: Thenable<string | undefined>;

    switch (type) {
        case 'info':
            promise = items
                ? vscode.window.showInformationMessage(message, ...items)
                : vscode.window.showInformationMessage(message, options);
            break;
        case 'warning':
            promise = items
                ? vscode.window.showWarningMessage(message, ...items)
                : vscode.window.showWarningMessage(message, options);
            break;
        case 'error':
            promise = items
                ? vscode.window.showErrorMessage(message, ...items)
                : vscode.window.showErrorMessage(message, options);
            break;
    }

    if (!items) {
        setTimeout(() => {
            promise.then(result => {
                if (result) {
                    vscode.commands.executeCommand('workbench.action.closeMessages');
                }
            });
        }, timeout);
    }

    return promise;
}
