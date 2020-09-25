import { window } from 'vscode';

const imp1 = window.activeTextEditor?.document;

const imp2 = {
  a: imp1?.uri,
  b: imp1?.positionAt,
  c: window.activeTextEditor,
};
