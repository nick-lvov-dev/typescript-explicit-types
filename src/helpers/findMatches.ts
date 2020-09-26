export const findMatches = (regexp: RegExp, source: string): RegExpExecArray[] => {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = regexp.exec(source)) != null) matches.push(match);
  return matches;
};

export const findMatchIndexes = (regexp: RegExp, source: string): number[] => {
  return findMatches(regexp, source).map((x) => x.index);
};
