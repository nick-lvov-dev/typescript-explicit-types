function f2(
  a = () => 12,
  b = 'asd',
  c = 12,
  d = function (aa = 12, bb = 'asd') {
    return bb + aa;
  }
) {
  return 1;
}
