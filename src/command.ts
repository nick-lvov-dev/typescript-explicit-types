import { Position, window } from 'vscode';

export const commandId = 'extension.generateExplicitType';
export const commandHandler = (typescriptHoverResult: string, position: Position) => {
  const activeEditor = window.activeTextEditor;
  if (!activeEditor) {
    return;
  }

  const parsedType = typescriptHoverResult.split(':')[1].split('\n')[0];
  activeEditor.edit((editor) => editor.insert(position, `:${parsedType}`));
};
