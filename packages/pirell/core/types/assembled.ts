// Assembled<S>: the decorated pirell() surface type. Pure types —
// runtime lives in entry/assemble.ts, Fluent in types/fluent.ts
// (separate file avoids depending on its own dependent).

import type { Bound, Deferred, Op, Raw, Shape } from "./base.js";
import type { Tail } from "./chain.js";
import type { IsUnion } from "./codec.js";
import type { Fluent } from "./fluent.js";

export type OpMap = Record<string, Op<any, any, any>>;

// Unwraps a surface's bound value (paired with CurrentShp below —
// the two must stay in lockstep). Deferred checked FIRST: it
// structurally satisfies Bound too, so Bound-first would misroute it.
export type CurrentData<S> =
  S extends Deferred<infer Out extends Shape>
    ? Raw<Out>
    : S extends Bound<infer Shp extends Shape>
      ? Raw<Shp>
      : never;

// The surface's current proven Shape, read fresh at each Fluent call.
// Deferred checked first — see CurrentData above.
export type CurrentShp<S> =
  S extends Deferred<infer Out extends Shape>
    ? Out
    : S extends Bound<infer Shp extends Shape>
      ? Shp
      : ["..."];

// Rich Ops-aware Deferred: Omit strips the bare call signature first,
// or TS resolves calls against it and silently drops Ops.
type OpsDeferred<Shp extends Shape, Ops extends OpMap> = Omit<
  Deferred<Shp>,
  "value"
> & {
  (data: unknown): Assembled<Bound<Shp>> & {
    [P in keyof Ops]: Fluent<Ops[P], Bound<Shp>, Ops>;
  };
  readonly value: undefined;
};

// Retypes the surface after narrowing .extend(). Threads Ops through
// the Deferred arm so the call signature keeps the just-extended ops
// (without this, invoking the surface drops them).
type Reassembled<S, Shp extends Shape, Ops extends OpMap> =
  S extends Deferred<any>
    ? Assembled<OpsDeferred<Shp, Ops>>
    : S extends Bound<any>
      ? Assembled<Bound<Shp>>
      : never;

// Multi-key .extend() keeps S (no narrowing), but the Deferred call
// signature still needs the new Ops swapped in. Bound needs nothing:
// it carries Ops via the surrounding Fluent intersection already.
type ReOpped<S, Ops extends OpMap> =
  S extends Deferred<infer Out extends Shape>
    ? Assembled<OpsDeferred<Out, Ops>>
    : Assembled<S>;

type ChainFns<S> = [(arg: CurrentData<S>) => any, ...Array<(arg: any) => any>];

// Deferred-only compose member, split out so Assembled stays flat.
type Composable<S> =
  S extends Deferred<any>
    ? {
        compose<Fns extends ChainFns<S>>(
          ...fns: Fns & Tail<Fns, CurrentData<S>>
        ): Assembled<S>;
      }
    : unknown;

// .extend() always accepts; checking fires on Fluent's return at the
// call, not at registration. Bound keeps data-proven S (the call
// narrows anyway); Deferred keeps narrowing (its only shape source).
export type Assembled<S> = S & {
  extend<Ops extends OpMap>(
    ops: Ops,
  ): S extends Deferred<any>
    ? IsUnion<keyof Ops> extends true
      ? ReOpped<S, Ops> & { [P in keyof Ops]: Fluent<Ops[P], S, Ops> }
      : keyof Ops extends infer K extends keyof Ops
        ? Ops[K] extends Op<any, infer Out extends Shape, any>
          ? Reassembled<S, Out, Ops> & { [P in keyof Ops]: Fluent<Ops[P], S, Ops> }
          : never
        : never
    : Assembled<S> & { [P in keyof Ops]: Fluent<Ops[P], S, Ops> };
  // Deferred checked first — see CurrentData's comment above; otherwise
  // a Deferred's .pipe() wrongly collapsed to unknown (Bound's arm).
  pipe<Fns extends ChainFns<S>>(
    ...fns: Fns & Tail<Fns, CurrentData<S>>
  ): S extends Deferred<any> ? Assembled<S> : S extends Bound<any> ? unknown : Assembled<S>;
} & Composable<S>;
