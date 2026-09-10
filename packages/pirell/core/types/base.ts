import type { DataOf } from "./codec.js";

// --- Dim & Elem representation ---

export type Dim = "i" | "k";

// Branch: nested Shape, leaf type, or object — `unknown` excluded because it
// absorbs unions and collapses comparisons.
export type Branch =
  Shape | (string & {}) | (number & {}) | (boolean & {}) | object;

// JSON's positional vs. named fork for a Mixed node's children, kept
// distinct rather than force-unified.
export type Variants = Branch[] | Record<string, Branch>;

// "i..."/"k..." = Dim + heterogeneous children.
export type MixedTag = `${Dim}...`;

// Elem: dim, mixed tag, or a [dim, Branch] / [mixedTag, variants] pair.
export type Elem = Dim | MixedTag | [Dim, Branch] | [MixedTag, Variants];

// Every bare tag's dim in one lookup — replaces DimOf template inference.
// Shared by DataOfElem (codec.ts) and Normalize (match.ts).
export type DimTable = {
  i: "i";
  "i...": "i";
  k: "k";
  "k...": "k";
};

// Open-tail applies only to nested Shape; Mixed/MixedTag are terminal.
export type Shape = Elem[] | [...Elem[], "..."];

// One canonical Elem classification. match-shape.ts branches off its
// fields instead of re-spelling the four cases. Bare-vs-declared stays
// visible (branch/variants set or never) — that distinction drives the
// matcher's continuation, so no normalizer may erase it.
export type ElemCase<E extends Elem> = E extends Dim
  ? { dim: E; kind: "leaf"; branch: never; variants: never }
  : E extends MixedTag
    ? { dim: DimTable[E]; kind: "mixed"; branch: never; variants: never }
    : E extends [infer D extends Dim, infer B extends Branch]
      ? { dim: D; kind: "leaf"; branch: B; variants: never }
      : E extends [infer T extends MixedTag, infer V extends Variants]
        ? { dim: DimTable[T]; kind: "mixed"; branch: never; variants: V }
        : never;

// --- Data / Op ---

// Shape↔type mapping lives in codec.ts (DataOf/ShapeOf are inverses —
// same ladder, opposite directions). Raw/Op below build on DataOf.

// Raw<S> = DataOf<S> & optional brand, not a bare phantom — this is what
// lets a prior op's Raw<In> output satisfy the next op's DataOf<In> param
// with zero cast (PLAN.md: brand-removal). The [unknown] extends
// [DataOf<S>] guard covers S=[]/["..."]: `unknown & X` collapses to X, and
// a primitive return value has no properties in common with a bare
// optional-key object — so with no shape claim, Raw<S> stays unbranded
// unknown rather than an unsatisfiable object type.
declare const __shapeBrand: unique symbol;
// Exported for codec.ts's brand-presence gate: `ShapeBrand extends keyof D`
// skips the Raw<S> inference for unbranded (fresh-literal) inputs, where it
// can never yield a usable S. See _ShapeOf.
export type ShapeBrand = typeof __shapeBrand;
export type Raw<S extends Shape> = [unknown] extends [DataOf<S>]
  ? unknown
  : DataOf<S> & { readonly [__shapeBrand]?: S };

// Op is always curried: (...args) => (data: DataOf<In>) => Raw<Out>.
// Every op's data param carries its own In claim, enforced by ordinary TS
// parameter-type checking at any call site — type checking, not runtime
// checking: authoring is a plain JS function plus an annotation, no factory,
// no wrapper. Pipe/compose check the entry data param directly against
// DataOf<FirstIn<Fns>> (compose.ts); wrap checks per-call via Fluent's
// MatchShape (fluent.ts). Detours removed: a checked() wrapper (added an
// import), a generic <D>-surface Op with a rest-tuple gate (authoring
// either needed a makeOp factory or lost body typing), and an
// intersecting generic param (TS decomposes intersection sources during
// inference; conditional-on-D verdicts were directory-state-sensitive).
// __pirell brand is gone; thunk-vs-plain-fn discrimination is structural
// (arity), handled in compose.ts — see PLAN.md.
export type Op<
  In extends Shape,
  Out extends Shape,
  Args extends unknown[] = [],
> = (...args: Args) => (data: DataOf<In>) => Raw<Out>;

// Fluent<F,S> lives in types/fluent.ts — see PLAN.md "relocate .extend()'s
// shape check onto Fluent/call-site".

// Type-level tag for a data-bound surface. Forward-declared here to avoid
// a circular dependency; named Bound (not Wrapper) so it doesn't collide
// with the runtime class of the same concept (see type-safety.md).
export interface Bound<S extends Shape> {
  readonly __shape?: S;
  value: unknown;
}

// A Deferred is a lazy raw-JSON transform: calling it runs the pipeline
// on opaque input and returns a data-bound surface of shape Out. value is
// typed undefined (matching assemble.ts) since no data is bound yet.
//
// Deliberately bare — no Ops param, call sig returns plain Bound<Out>.
// PLAN.md "Deferred<Out,Ops> cost": the rich, Ops-aware call signature
// (Assembled<Bound<Out>> & {[P in keyof Ops]: Fluent<...>}) previously
// lived HERE, on the interface itself, costing ~2,354 instantiations to
// merely declare — paid at every reference to the type regardless of
// whether Ops had any keys yet. Investigated whether the original
// Ops-drop bug (BUGS.md: "pre-wired export" gap) required Ops on this
// interface specifically: it doesn't. Reassembled/ReOpped
// (types/assembled.ts) are the only places that ever construct a
// Deferred with real Ops — .extend()'s return type — so the rich shape
// now lives solely there, applied on top of this bare interface via
// intersection, not baked into the generic declaration every caller pays
// for. buildDeferred's invoke (builders.ts: `buildBound(..., ops)`) is
// runtime-only and unaffected — this is a type-level-only change.
export interface Deferred<Out extends Shape> {
  (data: unknown): Bound<Out>;
  readonly value: undefined;
}
