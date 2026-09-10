import type { Op, Raw, Shape } from "./base.js";
import type { DataOf } from "./codec.js";

// --- Shape gate for compose/pipe ---

// A zero-arg fn returning a fn is a curried Op-shaped link, matched by
// call shape alone — no nominal Op brand. Mirrors compose's own runtime
// check (`fn.length === 0 ? fn() : fn`).
type IsThunk<F> = F extends () => (data: any) => any ? true : false;

// Non-tuple arrays (length number) can't recurse tuple-style — map instead.
type IsTuple<Fns extends readonly unknown[]> = number extends Fns["length"]
  ? false
  : true;

// Both ends read off one ComposeChain walk (first In feeds input,
// last Out feeds result). extends-Shape guards keep the degenerate
// empty chain from leaking unknown through a vacuous-never match.
type ChainEnds<Fns extends readonly unknown[]> =
  ComposeChain<Fns> extends [infer First, ...unknown[]]
    ? ComposeChain<Fns> extends [...unknown[], infer Last]
      ? [
          First extends Op<infer FIn extends Shape, any, []> ? FIn : ["..."],
          IsThunk<Last> extends true
            ? Last extends Op<any, infer LOut extends Shape, any>
              ? Raw<LOut>
              : Last extends () => (data: any) => infer R
                ? R
                : never
            : Last extends (arg: any) => infer R
              ? R
              : never,
        ]
      : never
    : never;

// First link's In, shared by compose's return and pipe's signature so the
// two can't drift. ["..."] wherever the chain gives up (non-Op /
// parameterized / empty: graceful degradation, not rejection).
export type FirstIn<Fns extends readonly unknown[]> =
  ComposeChain<Fns> extends [infer First, ...unknown[]]
    ? First extends Op<infer FIn extends Shape, any, []>
      ? FIn
      : ["..."]
    : ["..."];

// Mismatch is a shape ({ok: false}), not a bare never a tuple pattern
// would match vacuously. Thunk links check the threaded raw value against
// DataOf directly — threaded, never derived (no ShapeOf call anywhere).
type Step<F, Cur> =
  IsThunk<F> extends true
    ? F extends Op<infer FIn, infer FOut, infer FArgs>
      ? FArgs extends []
        ? Cur extends DataOf<FIn>
          ? { ok: true; r: Raw<FOut>; l: Op<FIn, FOut, []> }
          : { ok: false }
        : { ok: false }
      : F extends () => (data: any) => infer R
        ? { ok: true; r: R; l: F }
        : { ok: false }
    : F extends (arg: Cur) => infer R
      ? { ok: true; r: R; l: (arg: Cur) => R }
      : { ok: false };

// Concretely typed links for assemble.ts's .pipe()/.compose(). Threads
// the raw value only — no proven-shape channel. Spreads keep each link's
// own signature (length unknown, so threading is impossible: unchecked).
export type Tail<Fns extends readonly unknown[], Cur> =
  IsTuple<Fns> extends true
    ? Fns extends [infer F, ...infer Rest]
      ? Step<F, Cur> extends {
          ok: true;
          r: infer R;
          l: infer L;
        }
        ? Rest extends []
          ? [L]
          : [L, ...Tail<Rest, R>]
        : never
      : []
    : Fns extends Array<infer F>
      ? Array<F>
      : never;

// First link keeps its double-curried Op type (passed un-invoked); later
// links are threaded — different positions, not duplication.
export type ComposeChain<Fns extends readonly unknown[]> =
  IsTuple<Fns> extends true
    ? Fns extends [infer F, ...infer Rest]
      ? IsThunk<F> extends true
        ? F extends Op<infer FIn, infer FOut, infer FArgs>
          ? FArgs extends []
            ? [Op<FIn, FOut, []>, ...Tail<Rest, Raw<FOut>>]
            : never
          : F extends () => (data: infer A) => infer R
            ? Rest extends []
              ? [() => (data: A) => R]
              : [() => (data: A) => R, ...Tail<Rest, R>]
            : never
        : F extends (arg: infer A) => infer R
          ? Rest extends []
            ? [(arg: A) => R]
            : [(arg: A) => R, ...Tail<Rest, R>]
          : never
      : never
    : Fns extends Array<infer F>
      ? F extends (arg: infer A) => infer R
        ? Array<(arg: A) => R>
        : Array<F>
      : never;

export type ComposeResult<Fns extends readonly unknown[]> =
  IsTuple<Fns> extends true ? ChainEnds<Fns>[1] : unknown; // non-tuple chain: statically untraceable, runtime still applies left-to-right
