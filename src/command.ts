import { commands, Position, Range, TextEdit, TextEditor, Uri, window, workspace, WorkspaceEdit } from 'vscode';
import { findMatchIndexes } from './helpers/findMatches';

export interface GenerateTypeInfo {
  typescriptHoverResult: string;
  typePosition: Position;
  isFunction?: boolean;
}

function executeFormatDocumentProvider(uri: Uri) {
  return commands.executeCommand<TextEdit[]>('vscode.executeFormatDocumentProvider', uri);
}

const generateType = async (
  { typescriptHoverResult, typePosition, isFunction }: GenerateTypeInfo,
  editor: TextEditor,
  isAutoFormatOn?: boolean
) => {
  const indexes = findMatchIndexes(/:/gm, typescriptHoverResult);
  const dirtyType = typescriptHoverResult.slice(isFunction ? indexes.slice(-1)[0] : indexes[0]);
  const cleanType = dirtyType.replace(/(`)/gm, '').replace(/\n+$/, '');
  await editor.edit((editor) => editor.insert(typePosition, cleanType));

  if (!isAutoFormatOn) return;

  const document = editor.document;
  const text = document.getText();
  const typeIndex = text.indexOf(cleanType.replace(/\n/gm, '\r\n'), document.offsetAt(typePosition));
  if (typeIndex < 0) return;

  const typePositionStart = document.positionAt(typeIndex);
  const typePositionEnd = document.positionAt(typeIndex + cleanType.length + (cleanType.match(/\n/gm)?.length ?? 0));
  const typeRange = new Range(typePositionStart, typePositionEnd);
  if (!typeRange) return;

  if (isAutoFormatOn) {
    const edits = await executeFormatDocumentProvider(document.uri);
    if (!edits) return;
    const workspaceEdit = new WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await workspace.applyEdit(workspaceEdit);
  }
};

export const commandId = 'extension.generateExplicitType';
export const commandHandler = async (generateTypeInfos: GenerateTypeInfo[], autoImport = false) => {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  await generateType(generateTypeInfos[0], editor, autoImport);
};
