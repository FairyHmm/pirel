// Function-calling-convention converters. Ops are authored in the curried
// form directly; these bridge to/from the flat (data, ...args) form for the
// rare data-first call sites. Both are shape-agnostic — they only flip the
// calling convention, deriving the other form from the input's own
// structure.

// makeCurry: flat (data, ...args) => result → curried (...args) => (data) => result.
export function makeCurry<A extends unknown[], D, R>(
  fn: (data: D, ...args: A) => R,
): (...args: A) => (data: D) => R {
  return (...args: A) =>
    (data: D) =>
      fn(data, ...args);
}

// Type-level curried → flat. A data param closed over outer generics
// (compose's `(data: DataOf<FirstIn<Fns>>)` inner return) does not
// round-trip — the entry claim lives at compose.ts, not in this
// shape-agnostic converter.
type Flatten<F> = F extends (...args: infer A) => (data: infer Data) => infer R
  ? (data: Data, ...args: A) => R
  : never;

// makeFlat: curried → flat; general form converter.
export function makeFlat<F extends (...args: any) => any>(fn: F): Flatten<F> {
  return ((data: any, ...args: any[]) => fn(...args)(data)) as Flatten<F>;
}
