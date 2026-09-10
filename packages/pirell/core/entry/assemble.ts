// pirell() runtime entry + re-exports (surface types live in types/;
// re-exported here as the backward-compatible import path).

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
