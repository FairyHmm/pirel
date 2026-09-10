// Calling-convention converters (curried ↔ flat). Shape-agnostic: they
// flip the convention from the input's own structure, nothing else.

// makeCurry: flat (data, ...args) => result → curried (...args) => (data) => result.
export function makeCurry<A extends unknown[], D, R>(
  fn: (data: D, ...args: A) => R,
): (...args: A) => (data: D) => R {
  return (...args: A) =>
    (data: D) =>
      fn(data, ...args);
}

// Type-level curried → flat. A data param closed over outer generics does
// not round-trip — the entry claim lives at compose.ts, not here.
type Flatten<F> = F extends (...args: infer A) => (data: infer Data) => infer R
  ? (data: Data, ...args: A) => R
  : never;

export function makeFlat<F extends (...args: any) => any>(fn: F): Flatten<F> {
  return ((data: any, ...args: any[]) => fn(...args)(data)) as Flatten<F>;
}
