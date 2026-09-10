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
//
// Deferred checked FIRST, not Bound: Deferred<Out,Ops> structurally
// satisfies `extends Bound<any>` too (has everything Bound has — a
// `value` property — plus a call signature), so checking Bound first
// silently misroutes every Deferred surface through Bound's branch.
// Was invisible pre-Ops-fix because Deferred's old call signature
// returned bare Bound<Out> either way; the Ops fix exposed it (see
// BUGS.md "Bound/Deferred branch order").
export type CurrentData<S> =
  S extends Deferred<infer Out extends Shape>
    ? Raw<Out>
    : S extends Bound<infer Shp extends Shape>
      ? Raw<Shp>
      : never;

// The surface's current proven Shape. Read fresh at each Fluent<F,S>
// call-site check (types/fluent.ts) — the check fires per-call, not once
// at .extend() registration; see PLAN.md/STATE.md for why.
//
// Deferred checked first — see CurrentData above.
export type CurrentShp<S> =
  S extends Deferred<infer Out extends Shape>
    ? Out
    : S extends Bound<infer Shp extends Shape>
      ? Shp
      : ["..."];

// Deferred is bare now (PLAN.md "Deferred<Out,Ops> cost" — no Ops param
// on the interface itself, ~2,354/site to merely declare). The rich,
// Ops-aware call signature lives ONLY here, produced fresh by whichever
// of Reassembled/ReOpped needs it. Omit<Deferred<Shp>, "value"> strips
// Deferred's bare call signature before intersecting the rich one back
// in — a plain `Deferred<Shp> & { (data): richReturn }` keeps BOTH call
// signatures as an overload set, and TS tries the bare one first,
// silently resolving `shared(data)` to bare Bound<Shp> and dropping Ops
// at every call site (caught by count.mts's single-shared scenario:
// `.double` didn't exist on the call result — see BUGS.md).
type OpsDeferred<Shp extends Shape, Ops extends OpMap> = Omit<
  Deferred<Shp>,
  "value"
> & {
  (data: unknown): Assembled<Bound<Shp>> & {
    [P in keyof Ops]: Fluent<Ops[P], Bound<Shp>, Ops>;
  };
  readonly value: undefined;
};

// Retypes the surface after a narrowing .extend() call. Ops is threaded
// through the Deferred arm so the surface's own call signature (invoking
// the Deferred with raw data) still wires the just-extended op(s) —
// without this, Reassembled<S, Out> alone produced a Deferred<Shp> whose
// *call signature* dropped Ops even though the surrounding intersection
// added the Fluent methods (BUGS.md: dropped only at the call signature,
// not at .extend() itself). Deferred checked first — see CurrentData.
type Reassembled<S, Shp extends Shape, Ops extends OpMap> =
  S extends Deferred<any>
    ? Assembled<OpsDeferred<Shp, Ops>>
    : S extends Bound<any>
      ? Assembled<Bound<Shp>>
      : never;

// Multi-key .extend() keeps S's own shape (see extend()'s IsUnion branch
// below — ARCHITECTURE.md: "not on multi-op calls"), but S's *call
// signature* still needs the new Ops swapped in, or a Deferred surface
// extended with 2+ ops at once loses them the same way the single-key
// path did before Reassembled threaded Ops through (BUGS.md). Bound has
// no call signature to fix — S as-is already carries Ops via the
// surrounding { [P in keyof Ops]: Fluent<...> } intersection.
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
