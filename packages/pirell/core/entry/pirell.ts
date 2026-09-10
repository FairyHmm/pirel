import type { Dim } from "../types/base.js";

// Bare data-bound surface (value only, no methods, untyped): the lean
// entry for callers who don't need assemble.ts's shape-inferring surface.
export class Wrapper<S> {
  constructor(public readonly value: unknown) {
    // Mirror pirell(undefined): a Wrapper must never hold undefined.
    if (value === undefined) {
      throw new TypeError(
        "Wrapper cannot hold undefined — pass a JSON value.",
      );
    }
  }
}

export function pirell<T>(data: T): Wrapper<Dim[]> {
  // pirell(undefined) is distinct from a missing argument — throw explicitly
  if (arguments.length === 0 || data === undefined) {
    throw new TypeError(
      "pirell(undefined) is not valid — pass a JSON value. Use assemble.ts's pirell() for the assembled/deferred forms.",
    );
  }
  return new Wrapper(data);
}
