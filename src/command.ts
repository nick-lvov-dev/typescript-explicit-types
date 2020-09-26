import { CodeAction, commands, languages, Position, Range, Selection, TextEdit, Uri, window, workspace, WorkspaceEdit } from 'vscode';
import { configurationId, ConfigurationKey } from './configuraiton';
import { sleep } from './sleep';

function executeCodeActionProvider(uri: Uri, range: Range) {
  return commands.executeCommand<CodeAction[]>('vscode.executeCodeActionProvider', uri, range);
}

const executeActionCommand = async (action: CodeAction) => {
  if (action.edit) await workspace.applyEdit(action.edit!);
  const command = action.command!;
  await commands.executeCommand.apply(null, [command.command, ...command.arguments!]);
};

export const commandId = 'extension.generateExplicitType';
export const commandHandler = async (typescriptHoverResult: string, position: Position, word: string, autoImport = false) => {
  const activeEditor = window.activeTextEditor;
  if (!activeEditor) {
    return;
  }

  const config = workspace.getConfiguration(configurationId);
  const isAutoFormatOn = config.get<boolean>(ConfigurationKey.formatAfterGeneration);

  if (!typescriptHoverResult.includes(word) && !word.includes('(')) return;
  const splitByWord = typescriptHoverResult.includes(word)
    ? typescriptHoverResult.split(word)
    : typescriptHoverResult.split(word.split('(')[0]);
  const dirtyType = splitByWord.slice(1)[0];
  const cleanType = dirtyType.replace(/(`)/gm, '').replace(/\n+$/, '');
  await activeEditor.edit((editor) => editor.insert(position, cleanType));

  if (!autoImport && !isAutoFormatOn) return;

  const document = activeEditor.document;
  const text = document.getText();
  const typeIndex = text.indexOf(cleanType.replace(/\n/gm, '\r\n'), text.indexOf(word));
  if (typeIndex < 0) return;

  const typePositionStart = document.positionAt(typeIndex);
  const typePositionEnd = document.positionAt(typeIndex + cleanType.length + (cleanType.match(/\n/gm)?.length ?? 0));
  const typeRange = new Range(typePositionStart, typePositionEnd);
  if (!typeRange) return;

  const initialSelection = new Selection(activeEditor.selection.anchor, activeEditor.selection.active);
  if (isAutoFormatOn) {
    if (autoImport) {
      activeEditor.selection = new Selection(typeRange.start, typeRange.end);
    }
    const edits = await commands.executeCommand<TextEdit[]>('vscode.executeFormatRangeProvider', document.uri, typeRange);
    if (!edits) return;
    const workspaceEdit = new WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await workspace.applyEdit(workspaceEdit);
  }

  if (autoImport) {
    const diagnosticsRange = isAutoFormatOn ? new Range(activeEditor.selection.start, activeEditor.selection.end) : typeRange;
    activeEditor.selection = initialSelection;
    for (let i = 0; i < 30; i++) {
      const diagnostics = languages.getDiagnostics(document.uri);
      if (diagnostics.find((x) => diagnosticsRange.contains(x.range) || x.range.contains(diagnosticsRange))) {
        const actions = await executeCodeActionProvider(document.uri, diagnosticsRange);
        const importTypeActions = actions?.filter((action) => {
          const args = action.command?.arguments;
          return Array.isArray(args) && args.some((x) => x.fixName === 'import');
        });
        if (importTypeActions?.length) {
          const fixAllAction = importTypeActions.find((x) => x.command!.command === '_typescript.applyFixAllCodeAction');

          if (fixAllAction) {
            await executeActionCommand(fixAllAction);
            break;
          } else {
            for (const action of importTypeActions) await executeActionCommand(action);
            break;
          }
        }
      }
      await sleep(100);
    }
  }
};
