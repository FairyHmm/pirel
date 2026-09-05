// pirell() runtime entry point. Surface types (Assembled<S>, Fluent<F,S>,
// etc.) live in types/assembled.ts and types/fluent.ts — this file is
// just the two-overload function and its re-exports for callers who
// import surface types from here (backward-compatible import path).

import { buildDeferred, buildBound } from "./builders.js";
import type { Bound, Deferred } from "../types/base.js";
import type { ShapeOf } from "../types/codec.js";
import type { Assembled, OpMap } from "../types/assembled.js";

export type { Assembled, OpMap };

export function pirell<T>(data: T): Assembled<Bound<ShapeOf<T>>>;
export function pirell(): Assembled<Deferred<[]>>;
export function pirell(...args: [unknown] | []): unknown {
  if (args.length === 0) {
    return buildDeferred([], {});
  }
  return buildBound(args[0], {});
}
