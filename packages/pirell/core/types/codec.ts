import type {
  Branch,
  Dim,
  Elem,
  MixedTag,
  Raw,
  Shape,
  ShapeBrand,
  Variants,
} from "./base.js";

// Bidirectional Shape mapping, side by side: forwards (Shape → type)
// first, backwards (type → Shape) second.

// --- Shape → type ---

// DataOf<S>: shape → concrete TS type, inverse of ShapeOf below. A
// Shape's elements form one recursive descent, not siblings —
// ["k",["i",number]] is "keyed container of arrays of number".
export type DataOf<S extends Shape> = S extends []
  ? unknown
  : S extends ["..."]
    ? unknown
    : S extends [infer Head extends Elem, ...infer Rest extends Shape]
      ? DataOfElem<Head, Rest>
      : unknown;

// Dim→container mapping, stated once. Indexed only by narrowed Dim
// (TS can't see through a deferred lookup).
type Container<D extends Dim, V> = { i: V[]; k: Record<string, V> }[D];

// Bare mixed tags carry no payload — fixed result per tag, read off a
// table (result position needs no constraint, so the generic lookup is
// fine here).
type MixedBare<T extends MixedTag> = {
  "i...": unknown[];
  "k...": Record<string, unknown>;
}[T];

type DataOfElem<E extends Elem, Rest extends Shape> = E extends Dim
  ? Container<E, DataOf<Rest>>
  : E extends MixedTag
    ? MixedBare<E>
    : E extends [infer D extends Dim, infer B extends Branch]
      ? B extends Shape
        ? Container<D, DataOf<B>>
        : Container<D, B>
      : E extends [infer T extends MixedTag, infer _V extends Variants]
        ? MixedBare<T>
        : unknown;

// --- Type → Shape ---

// Derives a Shape from a bare literal so calls need no `as Raw<S>` cast.
// Used by chain.ts where no declared Op exists (bare-thunk/plain-fn link
// outputs).

// True iff T is a genuine union (naked-T distributive trick).
export type IsUnion<T, U = T> = T extends U
  ? [U] extends [T]
    ? false
    : true
  : never;

// Single-evaluates _ShapeOf via infer R (re-spelling it cost ~2.5x)
// and narrows the result to Shape.
export type ShapeOf<D> = _ShapeOf<D> extends infer R extends Shape ? R : never;

// Index-signature objects vacuously match Raw's optional brand, inferring
// a bogus S — excluded before the Raw check. (Not fixed in Raw itself:
// that would break `as Raw<S>` casts in op authoring.)

// Concrete enough to encode as a Branch: not unknown/any, not a union
// (those go mixed), not a container (those recurse). Lets `[1,2,3]`
// derive [["i", number]] so a Branch-claiming op accepts a bare literal.
type IsConcreteLeaf<E> = [unknown] extends [E]
  ? false
  : IsUnion<E> extends true
    ? false
    : E extends readonly unknown[]
      ? false
      : E extends object
        ? false
        : true;

// Raw<S> inference runs only when D carries the brand (unbranded inputs
// can never yield a usable S) — skips ~2/3 of per-site shape cost. The
// tuple check trusts only concrete non-empty brands.
type _ShapeOf<D> =
  string extends keyof D
    ? ShapeOfElem<D>
    : ShapeBrand extends keyof D
      ? D extends Raw<infer S extends Shape>
        ? S extends [Elem, ...Shape]
          ? S
          : ShapeOfElem<D>
        : ShapeOfElem<D>
      : ShapeOfElem<D>;

type ShapeOfElem<D> = D extends readonly (infer E)[]
  ? IsUnion<E> extends true
    ? ["i..."]
    : IsConcreteLeaf<E> extends true
      ? [["i", E]]
      : ["i", ...ContainerTail<E>]
  // Uniform-first: concrete-leaf before union, so the common case
  // skips IsUnion entirely.
  : D extends object
    ? IsConcreteLeaf<D[keyof D]> extends true
      ? [["k", D[keyof D]]]
      : IsUnion<D[keyof D]> extends true
        ? ["k..."]
        : ["k", ...ContainerTail<D[keyof D]>]
    : [];

type ContainerTail<E> = [unknown] extends [E]
  ? []
  : E extends readonly unknown[]
    ? _ShapeOf<E>
    : E extends object
      ? _ShapeOf<E>
      : [];
