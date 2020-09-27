import { sleep } from '../../../helpers/sleep';

interface StubClass2 {
  a: number;
  b: string;
  c: () => void;
}

class StubClass1 {
  handle = async (dto: StubClass2) => {
    await sleep(50);
  };
}

export class TestClass3 {
  constructor(private readonly stub: StubClass1) {}

  async p3
  (
    a: StubClass2,
    b: StubClass2,
    c: StubClass2,
    d: StubClass2
  ) {
    return this.stub.handle(a);
  }
}
