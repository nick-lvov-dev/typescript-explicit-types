import { CodeAction, commands, languages, Position, Range, Uri, window, workspace } from 'vscode';

function executeCodeActionProvider(uri: Uri, range: Range) {
  return commands.executeCommand<CodeAction[]>('vscode.executeCodeActionProvider', uri, range);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const commandId = 'extension.generateExplicitType';
export const commandHandler = async (typescriptHoverResult: string, position: Position, autoImport = false) => {
  const activeEditor = window.activeTextEditor;
  if (!activeEditor) {
    return;
  }

  const parsedType = typescriptHoverResult.split(':')[1].split('\n')[0];
  await activeEditor.edit((editor) => editor.insert(position, `:${parsedType}`));
  if (!autoImport) return;

  const document = activeEditor.document;
  const typePosition = new Position(position.line, position.character + 2);
  const typeRange = document.getWordRangeAtPosition(typePosition);
  if (!typeRange) return;

  for (let i = 0; i < 50; i++) {
    const diagnostics = languages.getDiagnostics(document.uri);
    if (diagnostics.find((x) => x.range.contains(typePosition))) {
      const actions = await executeCodeActionProvider(document.uri, typeRange);
      const importTypeAction = actions?.find((action) => {
        const args = action.command?.arguments;
        return action.edit && Array.isArray(args) && args[0].fixName === 'import';
      });
      if (importTypeAction) {
        await workspace.applyEdit(importTypeAction.edit!);
        const command = importTypeAction.command!;
        await commands.executeCommand(command.command, command.arguments![0]);
        return;
      }
    }
    await sleep(100);
  }
};
