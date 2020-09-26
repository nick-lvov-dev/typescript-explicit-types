import { window } from 'vscode';

const cursor2 = {
  a: window.activeTextEditor,
  b: window.activeTextEditor?.document,
  c: {
    d: () => window.activeTextEditor?.document.uri,
  },
};
