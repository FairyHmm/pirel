import type {
  Branch,
  Dim,
  Elem,
  MixedTag,
  Raw,
  Shape,
  Variants,
} from "./base.js";

// Bidirectional Shape mapping. The two directions are inverses — same
// ladder, opposite ways — so they live side by side: forwards
// (Shape → type) first, backwards (type → Shape) second.

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

// Rest only matters when Head is a bare Dim/MixedTag (no Branch payload);
// then Rest is itself the nested Shape for the container's contents.
// Container constructor by dim — states the i→array / k→record mapping
// once instead of re-spelling it in every arm below. Only ever indexed
// by an already-narrowed Dim (a deferred table lookup can't satisfy the
// constraint — TS won't see through it). (No empty-Rest special case
// needed: DataOf<[]> is unknown, so Rest=[] falls out directly.)
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

// Narrows _ShapeOf's result for callers. A union element type is
// heterogeneous by construction → "i..."/"k...".
export type ShapeOf<D> = _ShapeOf<D> extends infer R extends Shape ? R : never;

// Index-signature objects vacuously match `Raw<infer S>` (an optional
// symbol key conflicts with nothing), inferring S as the whole Shape
// union — so they're excluded before the Raw check, not by changing Raw
// (which would break `as Raw<S>` casts in op authoring).

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

// Only trust the Raw brand when S is a concrete non-empty tuple (a real
// brand can only exist then: Raw<[]>/Raw<["..."]> collapse to unknown).
// Otherwise structural derivation, which round-trips bare literals.
type _ShapeOf<D> =
  string extends keyof D
    ? ShapeOfElem<D>
    : D extends Raw<infer S extends Shape>
      ? S extends [Elem, ...Shape]
        ? S
        : ShapeOfElem<D>
      : ShapeOfElem<D>;

// Inverse of DataOfElem above: same ladder, opposite direction —
// derives a container value's Elem-list where DataOfElem encodes one.
type ShapeOfElem<D> = D extends readonly (infer E)[]
  ? IsUnion<E> extends true
    ? ["i..."]
    : IsConcreteLeaf<E> extends true
      ? [["i", E]]
      : ["i", ...ContainerTail<E>]
  : D extends object
    ? IsUnion<D[keyof D]> extends true
      ? ["k..."]
      : IsConcreteLeaf<D[keyof D]> extends true
        ? [["k", D[keyof D]]]
        : ["k", ...ContainerTail<D[keyof D]>]
    : [];

// Leaves stop at []; containers recurse one level.
type ContainerTail<E> = [unknown] extends [E]
  ? []
  : E extends readonly unknown[]
    ? _ShapeOf<E>
    : E extends object
      ? _ShapeOf<E>
      : [];
