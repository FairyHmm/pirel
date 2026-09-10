import type { Elem, ElemCase, Shape } from "./base.js";

// Single-direction: Actual must extend In. Bare InE claims only dim+kind;
// declared InE compares its payload arm. Elem is closed — new arms must
// not subtype existing ones.
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
