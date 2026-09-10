import { describe, expectTypeOf, it } from "vitest";
import type { CheckShape } from "./match-shape.js";
import type { ShapeOf, DataOf } from "./codec.js";
import type { Shape } from "./base.js";

// Named-field shapes for testing both acceptance and rejection.
type UserShape = ["k...", { name: string; age: number }];
type OrderShape = ["k...", { id: number; total: number }];

describe("shape matching: CheckShape", () => {
  it("exact match: shapes with identical structure pass", () => {
    type Result = CheckShape<["i"], ["i"]>;
    expectTypeOf<Result>().toEqualTypeOf<["i"]>();
  });

  it("shape mismatch: different dimension types fail", () => {
    type Result = CheckShape<["i"], ["k"]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it("open tail: [...] matches any suffix in Actual", () => {
    type Result = CheckShape<["i", "..."], ["i", "k", "i"]>;
    expectTypeOf<Result>().toEqualTypeOf<["i", "k", "i"]>();
  });

  it("closed tail: exact length is required, extra elements fail", () => {
    type Result = CheckShape<["i"], ["i", "k"]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it("named shapes: differing field types reject", () => {
    type Result = CheckShape<[UserShape], [OrderShape]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it("named shape acceptance: matching fields pass", () => {
    type Result = CheckShape<
      [UserShape],
      [["k...", { name: string; age: number }]]
    >;
    expectTypeOf<Result>().toEqualTypeOf<
      [["k...", { name: string; age: number }]]
    >();
  });

  it("depth mismatch: extra dimensions fail", () => {
    type Result = CheckShape<["k", "i"], ["k", "i", "..."]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it("open tail accepts truncation: 0 extra dimensions in Actual", () => {
    type Result = CheckShape<["k", "i", "..."], ["k", "i"]>;
    expectTypeOf<Result>().toEqualTypeOf<["k", "i"]>();
  });

  // Bare In claims only dim+kind, so detailed Actual passes; declared In
  // makes a real claim, so bare Actual fails. Each direction pinned below.
  it("bare In accepts a Branch-declared Actual of the same dim", () => {
    type Result = CheckShape<["k"], [["k", number]]>;
    expectTypeOf<Result>().toEqualTypeOf<[["k", number]]>();
  });

  it("declared In still rejects a bare Actual (reverse direction)", () => {
    type Result = CheckShape<[["k", number]], ["k"]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it("bare In accepts a Variants-declared mixed Actual of the same dim", () => {
    type Result = CheckShape<["i..."], [["i...", [string, number]]]>;
    expectTypeOf<Result>().toEqualTypeOf<[["i...", [string, number]]]>();
  });

  it("leaf vs mixed kind still distinct even when In is bare", () => {
    type Result = CheckShape<["i"], ["i..."]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  // Variants payloads compare structurally — without that arm this
  // case would silently pass.
  it("declared-variants In rejects an incompatible-V Actual", () => {
    type Result = CheckShape<[["i...", [number]]], [["i...", [string]]]>;
    expectTypeOf<Result>().toEqualTypeOf<never>();
  });

  it("declared-variants In accepts a same-V Actual", () => {
    type Result = CheckShape<[["i...", [number]]], [["i...", [number]]]>;
    expectTypeOf<Result>().toEqualTypeOf<[["i...", [number]]]>();
  });
});

describe("shape inference: ShapeOf", () => {
  // Non-union primitives encode as Branch directly, so bare literals
  // satisfy real element-type claims (e.g. double) with no `as Raw<S>`.
  it("array of a concrete primitive derives a Branch leaf, not bare 'i'", () => {
    type Result = ShapeOf<number[]>;
    expectTypeOf<Result>().toEqualTypeOf<[["i", number]]>();
  });

  it("object with concrete primitive values derives a Branch leaf, not bare 'k'", () => {
    type Result = ShapeOf<Record<string, number>>;
    expectTypeOf<Result>().toEqualTypeOf<[["k", number]]>();
  });

  it("union element still derives the mixed tail, not a Branch", () => {
    type Result = ShapeOf<(number | string)[]>;
    expectTypeOf<Result>().toEqualTypeOf<["i..."]>();
  });

  it("array-of-array (container) recurses, carrying the leaf Branch through", () => {
    type Result = ShapeOf<number[][]>;
    expectTypeOf<Result>().toEqualTypeOf<["i", ["i", number]]>();
  });

  it("unknown-valued object stays opaque (no Branch, no crash)", () => {
    type Result = ShapeOf<Record<string, unknown>>;
    expectTypeOf<Result>().toEqualTypeOf<["k"]>();
  });

  // Regression: Raw's optional brand vacuously matches index-signature
  // objects, inferring a bogus S — excluded before the check, so
  // Record<string, T> derives a real shape, not the Shape union.
  it("index-signature object does not vacuously match Raw's optional brand", () => {
    type Result = ShapeOf<Record<string, number>>;
    expectTypeOf<Result>().toEqualTypeOf<[["k", number]]>();
    expectTypeOf<Result>().not.toEqualTypeOf<import("./base.js").Shape>();
  });
});

// DataOf/MatchData suite retired with match-data.ts: the pins only proved
// a dead type agreed with itself (gates check DataOf/MatchShape directly).
