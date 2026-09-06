// Assembled<S>: the decorated pirell() surface type. Pure types — the
// runtime pirell() entry lives in entry/assemble.ts; Fluent itself lives
// in types/fluent.ts (needs Assembled, so it's a separate file to avoid
// this file depending on its own dependent).

import type { Bound, Deferred, Op, Raw, Shape } from "./base.js";
import type { Tail } from "./chain.js";
import type { IsUnion } from "./codec.js";
import type { Fluent } from "./fluent.js";

export type OpMap = Record<string, Op<any, any, any>>;

// Unwraps a surface's bound value (Raw<S>). See CurrentShp below for the
// paired Shape half — the two must stay in lockstep.
export type CurrentData<S> =
  S extends Bound<infer Shp extends Shape>
    ? Raw<Shp>
    : S extends Deferred<infer Out extends Shape>
      ? Raw<Out>
      : never;

// The surface's current proven Shape. Read fresh at each Fluent<F,S>
// call-site check (types/fluent.ts) — the check fires per-call, not once
// at .extend() registration; see PLAN.md/STATE.md for why.
export type CurrentShp<S> =
  S extends Bound<infer Shp extends Shape>
    ? Shp
    : S extends Deferred<infer Out extends Shape>
      ? Out
      : ["..."];

// Retypes the surface after a narrowing .extend() call.
type Reassembled<S, Shp extends Shape> =
  S extends Bound<any>
    ? Assembled<Bound<Shp>>
    : S extends Deferred<any>
      ? Assembled<Deferred<Shp>>
      : never;

type ChainFns<S> = [(arg: CurrentData<S>) => any, ...Array<(arg: any) => any>];

// Deferred-only compose member, split out so Assembled stays flat.
type Composable<S> =
  S extends Deferred<any>
    ? {
        compose<Fns extends ChainFns<S>>(
          ...fns: Fns & Tail<Fns, CurrentData<S>, CurrentShp<S>>
        ): Assembled<S>;
      }
    : unknown;

// .extend() always accepts and wires whatever op(s) it's given; shape
// checking lives on Fluent's return type instead, firing at the call
// (.toEntries()), not at registration. See PLAN.md "relocate .extend()'s
// shape check onto Fluent/call-site".
//
// Bound keeps its data-proven S with no key-count dance: the Fluent call
// narrows to Bound<Out> anyway, and per-site K-inference + Out-inference
// + Reassembled never cache (fresh literal identities), costing ~16/call
// for nothing the call doesn't already provide. Deferred has no data, so
// it keeps the full narrowing path — its only shape source (load-bearing:
// single-key Deferred chains break without it). Multi-key keeps S as-is
// (ARCHITECTURE.md: "not on multi-op calls" — see STATE.md for the
// overload-collision bug the IsUnion gate replaced).
export type Assembled<S> = S & {
  extend<Ops extends OpMap>(
    ops: Ops,
  ): S extends Deferred<any>
    ? IsUnion<keyof Ops> extends true
      ? Assembled<S> & { [P in keyof Ops]: Fluent<Ops[P], S, Ops> }
      : keyof Ops extends infer K extends keyof Ops
        ? Ops[K] extends Op<any, infer Out extends Shape, any>
          ? Reassembled<S, Out> & { [P in keyof Ops]: Fluent<Ops[P], S, Ops> }
          : never
        : never
    : Assembled<S> & { [P in keyof Ops]: Fluent<Ops[P], S, Ops> };
  pipe<Fns extends ChainFns<S>>(
    ...fns: Fns & Tail<Fns, CurrentData<S>, CurrentShp<S>>
  ): S extends Bound<any> ? unknown : Assembled<S>;
} & Composable<S>;
