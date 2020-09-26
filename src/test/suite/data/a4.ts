import { ArrowFuncArgTestType } from './types';

const a: ArrowFuncArgTestType = (
  a4,
  b = function () {
    return 1;
  }
) => {
  a4 + b();
};
