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

export type Elem = Dim | MixedTag | [Dim, Branch] | [MixedTag, Variants];

// Bare-tag → dim lookup for ElemCase's mixed arms (avoids template inference).
export type DimTable = {
  i: "i";
  "i...": "i";
  k: "k";
  "k...": "k";
};

// Open-tail applies only to nested Shape; Mixed/MixedTag are terminal.
export type Shape = Elem[] | [...Elem[], "..."];

// Single canonical Elem classifier — matchers branch off its fields.
// Bare-vs-declared must stay visible: it drives the matcher's continuation.
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

// Optional brand lets a prior op's output satisfy the next op's input
// with zero cast. The unknown-guard keeps unshaped claims as plain
// unknown instead of an unsatisfiable object type.
declare const __shapeBrand: unique symbol;
// Exported for codec.ts's brand-presence gate.
export type ShapeBrand = typeof __shapeBrand;
export type Raw<S extends Shape> = [unknown] extends [DataOf<S>]
  ? unknown
  : DataOf<S> & { readonly [__shapeBrand]?: S };

// Data param carries its own In claim under ordinary TS checking —
// plain JS function + annotation, no factory. (Detours that cost more:
// checked() wrapper, generic-<D> Op, intersecting param.)
export type Op<
  In extends Shape,
  Out extends Shape,
  Args extends unknown[] = [],
> = (...args: Args) => (data: DataOf<In>) => Raw<Out>;

// Type-level tag for a data-bound surface. Forward-declared here to avoid
// a circular dependency; named Bound (not Wrapper) so it doesn't collide
// with the runtime class of the same concept (see type-safety.md).
export interface Bound<S extends Shape> {
  readonly __shape?: S;
  value: unknown;
}

// Deliberately bare: the rich Ops-aware call signature cost ~2,354
// insts to merely declare. It lives in assembled.ts instead, applied
// via intersection (runtime invoke unaffected — type-level only).
export interface Deferred<Out extends Shape> {
  (data: unknown): Bound<Out>;
  readonly value: undefined;
}
