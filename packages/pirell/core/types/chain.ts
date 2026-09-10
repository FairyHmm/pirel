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

// Both ends of the chain, read off the single ComposeChain computation:
// the first link's In feeds the input gate, the last link's Out feeds the
// result projection. Previously two separate walks (FirstIn over raw Fns,
// LastOut over the normalized chain) — one ends-of-chain concept instead.
// The first link is already normalized by ComposeChain (Op stays Op, bare
// thunk stays thunk), so the []-args gate reads the same here as on raw
// Fns; a parameterized first link already poisons ComposeChain to never
// at the fns param. The extends-Shape guards keep the degenerate empty
// chain (already rejected at the param) from leaking unknown through the
// vacuous-never match.
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

// First link's In, read off the normalized chain — the entry claim shared
// by compose's return and pipe's signature so the two call sites can't
// drift. ["..."] (unknown data claim) wherever ChainEnds also gives up
// (non-Op / parameterized / empty: graceful degradation, not rejection).
// The data param is typed DataOf<FirstIn<Fns>> directly — no per-call D
// generic, so distinct literals cost plain assignability (~0), the same
// mechanism Op's own DataOf<In> param already relies on.
export type FirstIn<Fns extends readonly unknown[]> =
  ComposeChain<Fns> extends [infer First, ...unknown[]]
    ? First extends Op<infer FIn extends Shape, any, []>
      ? FIn
      : ["..."]
    : ["..."];

// One link step, tagged so a mismatch is a distinct shape (`{ok: false}`)
// rather than a bare `never` a tuple pattern would match vacuously. Tail
// discriminates on `ok` directly — no separate `extends never` guard
// needed before destructuring, because the false arm simply doesn't
// satisfy the `{ok: true, ...}` pattern (measured cheaper per recursion
// frame than the old bind-then-guard-then-destructure sequence; see
// PLAN.md). A thunk link with a declared Op checks the threaded raw
// value directly against `DataOf<FIn>` — the same mechanism compose.ts's
// own entry param already uses (0 marginal cost vs ShapeOf-derive-then-
// MatchShape's 71/site; see HANDOFF.md Finding 3/4). No ShapeOf call
// anywhere in Step: nothing is derived from the carried value, it's just
// threaded and structurally checked. This also fixes the k/i kind-tagging
// bug (Finding 2): a uniform Record now satisfies a mixed-tagged In like
// stringifyValues's, because DataOf<FIn> checks structure, not a derived
// leaf/mixed tag.
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

// Concretely typed links; exported for reuse by assemble.ts's fluent
// .pipe()/.compose(). Threads the raw value (Cur) only — no separate
// proven-shape channel, per the redesign (see Step). Non-tuple (spread)
// chains keep each link's own signature — length is unknown so per-link
// threading is impossible; spreads are unchecked by design (see
// compose.test.ts), same as ComposeChain's non-tuple arm.
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

// First link keeps its double-curried Op type — the op itself is passed
// positionally, un-invoked; Tail types the remaining links the same way
// (a first link has no incoming Cur, so it keeps its own arg type while
// later links are threaded — different positions, not duplication).
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
