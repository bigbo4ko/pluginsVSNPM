"use strict";
const path = require('path');
const fs = require('fs');
const vscode_1 = require('vscode');
const vscode_languageclient_1 = require('vscode-languageclient');
const tslintConfig = [
    '{',
    '	"rules": {',
    '		"no-unused-expression": true,',
    '		"no-duplicate-variable": true,',
    '		"no-duplicate-key": true,',
    '		"no-unused-variable": true,',
    '		"curly": true,',
    '		"class-name": true,',
    '		"semicolon": ["always"],',
    '		"triple-equals": true',
    '	}',
    '}'
].join(process.platform === 'win32' ? '\r\n' : '\n');
var AllFixesRequest;
(function (AllFixesRequest) {
    AllFixesRequest.type = { get method() { return 'textDocument/tslint/allFixes'; } };
})(AllFixesRequest || (AllFixesRequest = {}));
var Status;
(function (Status) {
    Status[Status["ok"] = 1] = "ok";
    Status[Status["warn"] = 2] = "warn";
    Status[Status["error"] = 3] = "error";
})(Status || (Status = {}));
var StatusNotification;
(function (StatusNotification) {
    StatusNotification.type = { get method() { return 'tslint/status'; } };
})(StatusNotification || (StatusNotification = {}));
let willSaveTextDocument;
let configurationChangedListener;
function activate(context) {
    let statusBarItem = vscode_1.window.createStatusBarItem(vscode_1.StatusBarAlignment.Right, 0);
    let tslintStatus = Status.ok;
    let serverRunning = false;
    statusBarItem.text = 'TSLint';
    statusBarItem.command = 'tslint.showOutputChannel';
    function showStatusBarItem(show) {
        if (show) {
            statusBarItem.show();
        }
        else {
            statusBarItem.hide();
        }
    }
    function updateStatus(status) {
        switch (status) {
            case Status.ok:
                statusBarItem.color = undefined;
                break;
            case Status.warn:
                statusBarItem.color = 'yellow';
                break;
            case Status.error:
                statusBarItem.color = 'yellow'; // darkred doesn't work
                break;
        }
        tslintStatus = status;
        udpateStatusBarVisibility(vscode_1.window.activeTextEditor);
    }
    function isTypeScriptDocument(languageId) {
        return languageId === 'typescript' || languageId === 'typescriptreact';
    }
    function udpateStatusBarVisibility(editor) {
        //statusBarItem.text = tslintStatus === Status.ok ? 'TSLint' : 'TSLint!';
        switch (tslintStatus) {
            case Status.ok:
                statusBarItem.text = 'TSLint';
                break;
            case Status.warn:
                statusBarItem.text = 'TSLint: Warning';
                break;
            case Status.error:
                statusBarItem.text = 'TSLint: Error';
                break;
        }
        showStatusBarItem(serverRunning &&
            (tslintStatus !== Status.ok ||
                (editor && (isTypeScriptDocument(editor.document.languageId)))));
    }
    vscode_1.window.onDidChangeActiveTextEditor(udpateStatusBarVisibility);
    udpateStatusBarVisibility(vscode_1.window.activeTextEditor);
    // We need to go one level up since an extension compile the js code into
    // the output folder.
    let serverModulePath = path.join(__dirname, '..', 'server', 'server.js');
    // break on start options
    //let debugOptions = { execArgv: ["--nolazy", "--debug=6004", "--debug-brk"] };
    let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };
    let serverOptions = {
        run: { module: serverModulePath },
        debug: { module: serverModulePath, options: debugOptions }
    };
    let clientOptions = {
        documentSelector: ['typescript', 'typescriptreact'],
        synchronize: {
            configurationSection: 'tslint',
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/tslint.json')
        },
        diagnosticCollectionName: 'tslint',
        initializationOptions: () => {
            let configuration = vscode_1.workspace.getConfiguration('tslint');
            return {
                nodePath: configuration ? configuration.get('nodePath', undefined) : undefined
            };
        },
        initializationFailedHandler: (error) => {
            if (error instanceof vscode_languageclient_1.ResponseError) {
                let responseError = error;
                if (responseError.code === 99) {
                    if (vscode_1.workspace.rootPath) {
                        client.info([
                            'Failed to load the TSLint library.',
                            'To use TSLint in this workspace please install tslint using \'npm install tslint\' or globally using \'npm install -g tslint\'.',
                            'You need to reopen the workspace after installing tslint.',
                        ].join('\n'));
                    }
                    else {
                        client.info([
                            'Failed to load the TSLint library.',
                            'To use TSLint for single TypeScript files install tslint globally using \'npm install -g tslint\'.',
                            'You need to reopen VS Code after installing tslint.',
                        ].join('\n'));
                    }
                    // actively inform the user in the output channel
                    client.outputChannel.show(true);
                }
                else if (responseError.code === 100) {
                    // inform the user but do not show the output channel
                    client.info([
                        'Failed to load the TSLint library.',
                        'Ignoring the failure since there is no \'tslint.json\' file at the root of this workspace.',
                    ].join('\n'));
                }
            }
            else {
                client.error('Server initialization failed.', error);
                client.outputChannel.show(true);
            }
            return false;
        },
    };
    let client = new vscode_languageclient_1.LanguageClient('tslint', serverOptions, clientOptions);
    const running = 'Linter is running.';
    const stopped = 'Linter has stopped.';
    client.onDidChangeState((event) => {
        if (event.newState === vscode_languageclient_1.State.Running) {
            client.info(running);
            statusBarItem.tooltip = running;
            serverRunning = true;
        }
        else {
            client.info(stopped);
            statusBarItem.tooltip = stopped;
            serverRunning = false;
        }
        udpateStatusBarVisibility(vscode_1.window.activeTextEditor);
    });
    client.onNotification(StatusNotification.type, (params) => {
        updateStatus(params.state);
    });
    function applyTextEdits(uri, documentVersion, edits) {
        let textEditor = vscode_1.window.activeTextEditor;
        if (textEditor && textEditor.document.uri.toString() === uri) {
            if (textEditor.document.version !== documentVersion) {
                vscode_1.window.showInformationMessage(`TSLint fixes are outdated and can't be applied to the document.`);
            }
            textEditor.edit(mutator => {
                for (let edit of edits) {
                    mutator.replace(vscode_languageclient_1.Protocol2Code.asRange(edit.range), edit.newText);
                }
            }).then((success) => {
                if (!success) {
                    vscode_1.window.showErrorMessage('Failed to apply TSLint fixes to the document. Please consider opening an issue with steps to reproduce.');
                }
            });
        }
    }
    function fixAllProblems() {
        let textEditor = vscode_1.window.activeTextEditor;
        if (!textEditor) {
            return;
        }
        let uri = textEditor.document.uri.toString();
        client.sendRequest(AllFixesRequest.type, { textDocument: { uri } }).then((result) => {
            if (result) {
                applyTextEdits(uri, result.documentVersion, result.edits);
            }
        }, (error) => {
            vscode_1.window.showErrorMessage('Failed to apply TSLint fixes to the document. Please consider opening an issue with steps to reproduce.');
        });
    }
    function createDefaultConfiguration() {
        if (!vscode_1.workspace.rootPath) {
            vscode_1.window.showErrorMessage('A TSLint configuration file can only be generated if VS Code is opened on a folder.');
        }
        let tslintConfigFile = path.join(vscode_1.workspace.rootPath, 'tslint.json');
        if (fs.existsSync(tslintConfigFile)) {
            vscode_1.window.showInformationMessage('A TSLint configuration file already exists.');
        }
        else {
            fs.writeFileSync(tslintConfigFile, tslintConfig, { encoding: 'utf8' });
        }
    }
    function configurationChanged() {
        let config = vscode_1.workspace.getConfiguration('tslint');
        let autoFix = config.get('autoFixOnSave', false);
        if (autoFix && !willSaveTextDocument) {
            willSaveTextDocument = vscode_1.workspace.onWillSaveTextDocument((event) => {
                let document = event.document;
                // only auto fix when the document was not auto saved
                if (!isTypeScriptDocument(document.languageId) || event.reason === vscode_1.TextDocumentSaveReason.AfterDelay) {
                    return;
                }
                const version = document.version;
                event.waitUntil(client.sendRequest(AllFixesRequest.type, { textDocument: { uri: document.uri.toString() } }).then((result) => {
                    if (result && version === result.documentVersion) {
                        return vscode_languageclient_1.Protocol2Code.asTextEdits(result.edits);
                    }
                    else {
                        return [];
                    }
                }));
            });
        }
        else if (!autoFix && willSaveTextDocument) {
            willSaveTextDocument.dispose();
            willSaveTextDocument = undefined;
        }
    }
    configurationChangedListener = vscode_1.workspace.onDidChangeConfiguration(configurationChanged);
    configurationChanged();
    context.subscriptions.push(new vscode_languageclient_1.SettingMonitor(client, 'tslint.enable').start(), configurationChangedListener, vscode_1.commands.registerCommand('tslint.applySingleFix', applyTextEdits), vscode_1.commands.registerCommand('tslint.applySameFixes', applyTextEdits), vscode_1.commands.registerCommand('tslint.applyAllFixes', applyTextEdits), vscode_1.commands.registerCommand('tslint.fixAllProblems', fixAllProblems), vscode_1.commands.registerCommand('tslint.createConfig', createDefaultConfiguration), vscode_1.commands.registerCommand('tslint.showOutputChannel', () => { client.outputChannel.show(); }), statusBarItem);
}
exports.activate = activate;
function deactivate() {
    if (willSaveTextDocument) {
        willSaveTextDocument.dispose();
        willSaveTextDocument = undefined;
    }
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map