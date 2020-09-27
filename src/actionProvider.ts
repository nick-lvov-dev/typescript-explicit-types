import uniqWith from 'lodash.uniqwith';
import {
  CodeAction,
  CodeActionContext,
  CodeActionKind,
  CodeActionProvider,
  CodeActionProviderMetadata,
  commands,
  DocumentSymbol,
  MarkdownString,
  Position,
  Range,
  Selection,
  SymbolKind,
  TextDocument,
  Uri,
  workspace,
} from 'vscode';
import { commandHandler, GenerateTypeInfo } from './command';
import { configurationId, ConfigurationKey } from './configuraiton';
import { findClosingBracketMatchIndex } from './helpers/findClosingBracketMatchIndex';
import { findMatches } from './helpers/findMatches';

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

function executeSymbolProvider(uri: Uri) {
  return commands.executeCommand<DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
}

// some definitions are followed by brackets, but the type hover shows them as properties
// since type extraction depends on whether the definition is a function or not, there are some exceptions
const functionHandlerExceptions = ['get'];

export class GenereateTypeProvider implements CodeActionProvider {
  public static readonly fixAllCodeActionKind = CodeActionKind.SourceFixAll.append('tslint');

  public static metadata: CodeActionProviderMetadata = {
    providedCodeActionKinds: [CodeActionKind.QuickFix],
  };

  public async provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext): Promise<CodeAction[]> {
    const config = workspace.getConfiguration(configurationId);
    const isPreferrable = config.get<boolean>(ConfigurationKey.preferable);
    const isAutoImportActionEnabled = config.get<boolean>(ConfigurationKey.enableImportAction);

    const allDefinitions: Location[] = [];
    for (let lineNumber = range.start.line; lineNumber <= range.end.line; lineNumber++) {
      const line = document.lineAt(lineNumber);
      const startCharNumber = lineNumber === range.start.line ? range.start.character : 0;
      const endCharNumber = lineNumber === range.end.line ? range.end.character : line.range.end.character;
      for (let charNumber = startCharNumber; charNumber <= endCharNumber; charNumber++) {
        const foundDefinitions = await executeDefinitionProvider(document.uri, new Position(lineNumber, charNumber));
        if (foundDefinitions?.length) allDefinitions.push(foundDefinitions[0]);
      }
    }

    if (!allDefinitions.length) return [];

    const definitions = uniqWith(allDefinitions, (a, b) => a.originSelectionRange.isEqual(b.originSelectionRange));
    const symbols = await executeSymbolProvider(document.uri);

    const generateTypeInfos: GenerateTypeInfo[] = [];
    for (const definition of definitions) {
      const hoverRes = await executeHoverProvider(document.uri, definition.originSelectionRange.start);
      if (!hoverRes) continue;

      // check if definition has a typescript annotation
      const tsHoverContent = hoverRes
        .reduce<string[]>((acc, val) => acc.concat(val.contents.map((x) => x.value)), [])
        .find((x) => x.includes('typescript'));
      if (!tsHoverContent) continue;

      const word = document.getText(definition.originSelectionRange);
      const lineText = document.getText(document.lineAt(definition.originSelectionRange.start.line).range);

      // => is recognized as a definition, but it's type is usually defined before, unlike all other types
      if (word === '=>') {
        // check that there are arrow functions without type on this line
        const regexp = /\)\s*=>/gm;
        const matches = findMatches(regexp, lineText);
        const indexes = matches.map((x) => x.index);
        if (!matches.length) continue;

        const passedIndex = indexes.find((i) => i > definition.originSelectionRange.start.character);

        // look for a potential index of a match
        // there might be several arrow functions on the same line & this definition might actually be one with a type
        const potentialIndexIndex = passedIndex ? indexes.indexOf(passedIndex) - 1 : indexes.length - 1;
        if (potentialIndexIndex < 0) continue;

        // check that our match contains the definition
        const potentialIndex = indexes[potentialIndexIndex];
        const definitionMatch = matches![potentialIndexIndex];
        if (
          potentialIndex >= definition.originSelectionRange.start.character ||
          potentialIndex + definitionMatch[0].length <= definition.originSelectionRange.start.character
        )
          continue;

        generateTypeInfos.push({
          isFunction: true,
          typescriptHoverResult: tsHoverContent,
          typePosition: new Position(definition.originSelectionRange.start.line, potentialIndex + 1),
        });
        continue;
      }

      const symbol = symbols?.find((x) => x.selectionRange.contains(definition.originSelectionRange));
      const trailingSlice = document.getText(new Range(definition.originSelectionRange.end, definition.targetRange.end));
      const isFollowedByBracket = !!trailingSlice.match(/^(\s|\\[rn])*\(/);
      if (symbol?.kind === SymbolKind.Function || word === 'function' || isFollowedByBracket) {
        // find out suitable type position by looking for a closing bracket of the function
        const offset = document.offsetAt(definition.originSelectionRange.end);
        const firstBracket = trailingSlice.indexOf('(');
        const closingBracketIndex = findClosingBracketMatchIndex(trailingSlice, firstBracket);

        const isFunctionTyped = trailingSlice.slice(closingBracketIndex + 1).match(/^\s*:/);
        if (isFunctionTyped) continue;

        const definitionSlice = document.getText(definition.targetRange);
        const firstSymbol = definitionSlice.match(/^\w+/);

        generateTypeInfos.push({
          typescriptHoverResult: tsHoverContent,
          typePosition: document.positionAt(offset + closingBracketIndex + 1),
          isFunction: !firstSymbol || !functionHandlerExceptions.includes(firstSymbol[0]),
        });
      } else {
        // check if type annotation is already present
        const typePosition = new Position(definition.originSelectionRange.end.line, definition.originSelectionRange.end.character);
        const slice = lineText.slice(typePosition.character);
        const match = slice.match(/^\s*:/g);
        if (match?.length) continue;

        generateTypeInfos.push({
          typescriptHoverResult: tsHoverContent,
          typePosition,
        });
      }
    }

    if (!generateTypeInfos.length) return [];

    const action = new CodeAction('Generate explicit type', CodeActionKind.QuickFix);
    const args: Parameters<typeof commandHandler> = [generateTypeInfos];
    action.command = { command: 'extension.generateExplicitType', title: 'Generate explicit type', arguments: args };
    action.isPreferred = isPreferrable;

    if (generateTypeInfos.length > 1 || !isAutoImportActionEnabled) return [action];

    const actionWithAutoImport = new CodeAction('Generate explicit type & import', CodeActionKind.QuickFix);
    actionWithAutoImport.command = {
      command: 'extension.generateExplicitType',
      title: 'Generate explicit type & import',
      arguments: [...args, true],
    };
    actionWithAutoImport.isPreferred = isPreferrable;
    return [actionWithAutoImport, action];
  }
}
