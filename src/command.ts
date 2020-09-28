import {
  CodeAction,
  commands,
  languages,
  Position,
  Range,
  Selection,
  TextEdit,
  TextEditor,
  Uri,
  window,
  workspace,
  WorkspaceEdit,
} from 'vscode';
import { configurationId, ConfigurationKey } from './configuraiton';
import { findMatchIndexes } from './helpers/findMatches';
import { sleep } from './helpers/sleep';

export interface GenerateTypeInfo {
  typescriptHoverResult: string;
  typePosition: Position;
  isFunction?: boolean;
}

function executeCodeActionProvider(uri: Uri, range: Range) {
  return commands.executeCommand<CodeAction[]>('vscode.executeCodeActionProvider', uri, range);
}

function executeFormatDocumentProvider(uri: Uri) {
  return commands.executeCommand<TextEdit[]>('vscode.executeFormatDocumentProvider', uri);
}

const executeActionCommand = async (action: CodeAction) => {
  if (action.edit) await workspace.applyEdit(action.edit!);
  const command = action.command!;
  await commands.executeCommand.apply(null, [command.command, ...command.arguments!]);
};

const generateType = async (
  { typescriptHoverResult, typePosition, isFunction }: GenerateTypeInfo,
  editor: TextEditor,
  autoImport?: boolean,
  isAutoFormatOn?: boolean
) => {
  const indexes = findMatchIndexes(/:/gm, typescriptHoverResult);
  const dirtyType = typescriptHoverResult.slice(isFunction ? indexes.slice(-1)[0] : indexes[0]);
  const cleanType = dirtyType.replace(/(`)/gm, '').replace(/\n+$/, '');
  await editor.edit((editor) => editor.insert(typePosition, cleanType));

  if (!autoImport && !isAutoFormatOn) return;

  const document = editor.document;
  const text = document.getText();
  const typeIndex = text.indexOf(cleanType.replace(/\n/gm, '\r\n'), document.offsetAt(typePosition));
  if (typeIndex < 0) return;

  const typePositionStart = document.positionAt(typeIndex);
  const typePositionEnd = document.positionAt(typeIndex + cleanType.length + (cleanType.match(/\n/gm)?.length ?? 0));
  const typeRange = new Range(typePositionStart, typePositionEnd);
  if (!typeRange) return;

  const initialSelection = new Selection(editor.selection.anchor, editor.selection.active);
  if (isAutoFormatOn) {
    if (autoImport) {
      editor.selection = new Selection(typeRange.start, typeRange.end);
    }
    const edits = await executeFormatDocumentProvider(document.uri);
    if (!edits) return;
    const workspaceEdit = new WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await workspace.applyEdit(workspaceEdit);
  }

  if (autoImport) {
    const diagnosticsRange = isAutoFormatOn ? new Range(editor.selection.start, editor.selection.end) : typeRange;
    editor.selection = initialSelection;
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

export const commandId = 'extension.generateExplicitType';
export const commandHandler = async (generateTypeInfos: GenerateTypeInfo[], autoImport = false) => {
  const editor = window.activeTextEditor;
  if (!editor) {
    return;
  }

  const config = workspace.getConfiguration(configurationId);
  const isAutoFormatOn = config.get<boolean>(ConfigurationKey.formatAfterGeneration);

  await generateType(generateTypeInfos[0], editor, autoImport, isAutoFormatOn);
};
