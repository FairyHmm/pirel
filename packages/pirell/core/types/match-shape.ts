import type { Elem, ElemCase, Shape } from "./base.js";

// Shape-vs-Shape matching. Independent of any wiring pattern.

// Single-direction: Actual must extend In. Elem is closed — a new arm must
// not classify to a subtype of an existing one. Both sides go through the
// canonical ElemCase; the continuation branches off its fields. A bare InE
// (branch and variants both never) claims only dim+kind, so any
// same-dim+kind ActualE satisfies it; a declared InE compares its payload
// arm (branch xor variants — never-guarded both sides, since bare never
// matches everything). Indexed access (not extends-destructure) re-references
// ElemCase<InE>/ElemCase<ActualE> through tsc's per-argument alias cache
// instead of re-running a pattern match to bind each field.
type MatchElem<InE extends Elem, ActualE extends Elem> =
  ElemCase<ActualE>["dim"] extends ElemCase<InE>["dim"]
    ? ElemCase<ActualE>["kind"] extends ElemCase<InE>["kind"]
      ? [ElemCase<InE>["branch"]] extends [never]
        ? [ElemCase<InE>["variants"]] extends [never]
          ? true
          : [ElemCase<ActualE>["variants"]] extends [never]
            ? false
            : ElemCase<ActualE>["variants"] extends ElemCase<InE>["variants"]
              ? true
              : false
        : [ElemCase<ActualE>["branch"]] extends [never]
          ? false
          : ElemCase<ActualE>["branch"] extends ElemCase<InE>["branch"]
            ? true
            : false
      : false
    : false;

// "..." isn't an Elem, so its check precedes the Head/Tail destructure.
export type MatchShape<In extends Shape, Actual extends Shape> = In extends []
  ? Actual extends []
    ? true
    : false
  : In extends ["..."]
    ? true
    : [In, Actual] extends [
          [infer InHead extends Elem, ...infer InTail extends Shape],
          [infer AHead extends Elem, ...infer ATail extends Shape],
        ]
      ? MatchElem<InHead, AHead> extends true
        ? MatchShape<InTail, ATail>
        : false
      : false;

// Narrowing gate: returns the matched Shape for callers that keep it.
export type CheckShape<In extends Shape, Actual extends Shape> =
  MatchShape<In, Actual> extends true ? Actual : never;
