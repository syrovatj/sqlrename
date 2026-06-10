'use strict';

const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Spawns the Python rename engine in stdin/stdout mode.
 * @param {string} pythonPath
 * @param {string} scriptPath
 * @param {string} csvArg
 * @param {string | null} targetSchema
 * @param {string} dbDialect
 * @param {string} sqlText
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runPythonEngine(pythonPath, scriptPath, csvArg, targetSchema, dbDialect, sqlText) {
    // Always pass both targetSchema and dialect in fixed positions;
    // empty string tells Python to fall back to its own defaults.
    const args = [scriptPath, csvArg];
    if (targetSchema) args.push(targetSchema);
    else                args.push('');
    args.push(dbDialect !== 'oracle' ? dbDialect : '');

    return new Promise((resolve, reject) => {
        const proc = spawn(pythonPath, args, { env: process.env });

        /** @type {Buffer[]} */
        const stdoutChunks = [];
        /** @type {Buffer[]} */
        const stderrChunks = [];

        proc.stdout.on('data', chunk => stdoutChunks.push(chunk));
        proc.stderr.on('data', chunk => stderrChunks.push(chunk));

        proc.on('error', err => {
            const nodeErr = /** @type {NodeJS.ErrnoException} */ (err);
            if (nodeErr.code === 'ENOENT') {
                reject(new Error(
                    `Python executable not found: "${pythonPath}". ` +
                    `Install Python 3 or set sqlrename.pythonPath in VS Code settings.`
                ));
            } else {
                reject(err);
            }
        });

        proc.on('close', exitCode => {
            const stdout = Buffer.concat(stdoutChunks).toString('utf8');
            const stderr = Buffer.concat(stderrChunks).toString('utf8');

            if (exitCode === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(
                    `Python engine exited with code ${exitCode}.\n\n${stderr || stdout}`
                ));
            }
        });

        // Write SQL to stdin and signal EOF so Python's stdin.read() unblocks
        proc.stdin.write(sqlText, 'utf8');
        proc.stdin.end();
    });
}

/**
 * Resolves the mapping CSV setting to an absolute path.
 *   - Empty/unset  → bundled CSV inside the extension
 *   - Absolute     → used as-is
 *   - Relative     → resolved against the first workspace folder;
 *                    falls back to bundled CSV if no folder is open
 * @param {string | undefined} setting
 * @param {string} extensionPath
 * @returns {string}
 */
function resolveCsvPath(setting, extensionPath) {
    const bundled = path.join(extensionPath, 'rename_engine', 'name_conversion.csv');
    if (!setting) return bundled;
    if (path.isAbsolute(setting)) return setting;
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return path.join(folders[0].uri.fsPath, setting);
    }
    return bundled;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('sqlrename extension activated');

    // Create the output channel once for the lifetime of the extension.
    // Creating it inside the command handler would add a new entry to the
    // Output panel dropdown on every invocation.
    const outputChannel = vscode.window.createOutputChannel('SQL Rename');
    context.subscriptions.push(outputChannel);

    context.subscriptions.push(
        vscode.commands.registerCommand('sqlrename.helloWorld', () => {
            vscode.window.showInformationMessage('Hello World from sqlrename!');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sqlrename.renameSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('SQL Rename: no active editor.');
                return;
            }

            const selection = editor.selection;
            const sqlText = selection.isEmpty
                ? editor.document.getText()
                : editor.document.getText(selection);

            if (!sqlText.trim()) {
                vscode.window.showWarningMessage('SQL Rename: selection is empty.');
                return;
            }

            const config = vscode.workspace.getConfiguration('sqlrename');
            const pythonPath = config.get('pythonPath') || 'python3';
            const csvArg = resolveCsvPath(config.get('mappingCsvPath'), context.extensionPath);
            const targetSchema = config.get('targetSchema') || null;
            const dbDialect = config.get('dbDialect') || 'oracle';
            const scriptPath = path.join(
                context.extensionPath,
                'rename_engine',
                'rewrite_sql_schemaless.py'
            );

            let result;
            try {
                result = await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'SQL Rename: rewriting…',
                        cancellable: false,
                    },
                    () => runPythonEngine(
                        /** @type {string} */ (pythonPath),
                        scriptPath,
                        csvArg,
                        targetSchema,
                        dbDialect,
                        sqlText
                    )
                );
            } catch (err) {
                outputChannel.appendLine('--- ERROR ---');
                outputChannel.appendLine(err instanceof Error ? err.message : String(err));
                outputChannel.show(true);
                vscode.window.showErrorMessage('SQL Rename failed. See "SQL Rename" output channel.');
                return;
            }

            const doc = await vscode.workspace.openTextDocument({
                language: 'sql',
                content: result.stdout,
            });
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: false,
            });

            if (result.stderr.trim()) {
                outputChannel.appendLine('--- SQL Rename warnings ---');
                outputChannel.appendLine(result.stderr.trim());
                outputChannel.show(true);
                vscode.window.showWarningMessage(
                    'SQL Rename: some names were not mapped. See "SQL Rename" output channel.'
                );
            }
        })
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
