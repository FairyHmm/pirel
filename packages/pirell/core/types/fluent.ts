// Fluent<F,S,Ops>: the type of a wired method (.toEntries(), .double()). The
// shape check fires here, at the call, not at .extend() registration —
// see PLAN.md "relocate .extend()'s shape check onto Fluent/call-site".
//
// Ops carries every op registered alongside F in the same .extend() call
// (builders.ts's buildSurface threads the full ops map through every
// returned surface unchanged, at runtime). On success, Fluent re-wires
// all of Ops onto the narrowed Bound<Out>, each re-checked fresh via its
// own Fluent<Ops[P], Bound<Out>, Ops> — a sibling that no longer fits
// becomes uncallable rather than vanishing from the surface's type,
// matching what's actually still there at runtime.
//
// The success/failure split sits OUTSIDE the `() => ...` arrow — load-
// bearing, not stylistic. A member typed `() => ShapeMismatch<...>` is
// still an ordinary callable function, so tsc only objects where the
// return value is actually constrained (annotation, chained call,
// `.value` access) — a bare `const r = surface.badOp();` with no further
// use satisfies `() => anything` trivially and stays silent. Splitting
// the conditional so the failure arm isn't a function at all makes the
// call itself ill-typed (`This expression is not callable`, TS2349),
// unconditional on what the caller does with the result.

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
