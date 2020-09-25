import { Duplex } from 'stream';
import {
  CancellationToken,
  CodeAction,
  CodeActionContext,
  CodeActionKind,
  CodeActionProvider,
  CodeActionProviderMetadata,
  commands,
  languages,
  MarkdownString,
  Position,
  Range,
  Selection,
  TextDocument,
  Uri,
} from 'vscode';
import { commandHandler } from './command';

interface Hover {
  range: Range;
  contents: MarkdownString[];
}

interface Location {
  originSelectionRange: Range;
  targetRange: Range;
  targetSelectionRange: Range;
  targetUri: Uri;
}

function executeHoverProvider(uri: Uri, position: Position) {
  return commands.executeCommand<Hover[]>('vscode.executeHoverProvider', uri, position);
}

function executeDefinitionProvider(uri: Uri, position: Position) {
  return commands.executeCommand<Location[]>('vscode.executeDefinitionProvider', uri, position);
}

const isDefinitionFocused = (document: TextDocument, range: Range, location: Location): boolean =>
  document.uri.path === location.targetUri.path && location.targetSelectionRange.contains(range);

export class GenereateTypeProvider implements CodeActionProvider {
  public static readonly fixAllCodeActionKind = CodeActionKind.SourceFixAll.append('tslint');

  public static metadata: CodeActionProviderMetadata = {
    providedCodeActionKinds: [CodeActionKind.QuickFix],
  };

  public async provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext): Promise<CodeAction[]> {
    // don't shot action if there are errors
    if (context.diagnostics.length) return [];

    const rangeText = document.getText(range);
    if (rangeText.includes(':')) return [];

    const wordRange = document.getWordRangeAtPosition(range.start, /(\w|\(|\))+/);
    if (!wordRange) return [];

    const documentDiagnostics = languages.getDiagnostics(document.uri);
    if (documentDiagnostics.some((x) => x.range.contains(wordRange))) return [];

    // make sure we're looking at a definition
    const definitions = await executeDefinitionProvider(document.uri, range.start);
    if (!definitions?.some((x) => isDefinitionFocused(document, range, x))) return [];

    const nextSymbolEndPosition = new Position(wordRange.end.line, wordRange.end.character + 1);
    const followingText = document.getText(new Range(wordRange.end, nextSymbolEndPosition));
    if (followingText === ':') return [];

    const res = await executeHoverProvider(document.uri, range.start);
    if (!res) return [];

    const tsHoverContent = res
      .reduce<string[]>((acc, val) => acc.concat(val.contents.map((x) => x.value)), [])
      .find((x) => x.includes('typescript'));
    if (!tsHoverContent) return [];

    const action = new CodeAction('Generate explicit type', CodeActionKind.QuickFix);
    const args: Parameters<typeof commandHandler> = [tsHoverContent, wordRange.end];
    action.command = { command: 'extension.generateExplicitType', title: 'Generate explicit type', arguments: args };

    const actionWithAutoImport = new CodeAction('Generate explicit type & import', CodeActionKind.QuickFix);
    actionWithAutoImport.command = {
      command: 'extension.generateExplicitType',
      title: 'Generate explicit type & import',
      arguments: [...args, true],
    };
    actionWithAutoImport.isPreferred = true;
    return [actionWithAutoImport, action];
  }
}
