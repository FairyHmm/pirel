// Fluent<F,S,Ops>: a wired method. Check fires at the call; Ops re-wire
// onto Bound<Out> (unfit siblings uncallable, not vanished); failure arm
// sits outside the arrow so the call itself is uncallable (TS2349).

import type { Bound, Op, Shape } from "./base.js";
import type { MatchShape } from "./match-shape.js";
import type { Assembled, CurrentShp, OpMap } from "./assembled.js";

// Named failure type instead of bare `never`, so a mismatch's error
// message names what didn't match rather than showing an opaque never.
export type ShapeMismatch<In extends Shape, Actual extends Shape> = {
  readonly __pirellShapeMismatch: true;
  expected: In;
  actual: Actual;
};

export type Fluent<F extends Op<any, any, any>, S, Ops extends OpMap = {}> =
  F extends Op<infer In extends Shape, infer Out extends Shape, any>
    ? MatchShape<In, CurrentShp<S>> extends true
      ? () => Assembled<Bound<Out>> & {
          [P in keyof Ops]: Fluent<Ops[P], Bound<Out>, Ops>;
        }
      : ShapeMismatch<In, CurrentShp<S>>
    : never;
