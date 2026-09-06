import { describe, it, expect, expectTypeOf } from "vitest";
import { pirell } from "./assemble.js";
import {
  double,
  sumAll,
  toEntries,
  sumValues,
  flattenEntries,
} from "../ops/fixture-ops.js";

describe("Deferred.value typing", () => {
  it("is always undefined, at both runtime and type level", () => {
    const deferred = pirell();
    expect(deferred.value).toBeUndefined();
    expectTypeOf(deferred.value).toEqualTypeOf<undefined>();
  });
});

describe("Deferred (pirell()): builder surfaces", () => {
  it("builds a fluent transform, callable with raw JSON", () => {
    const chain = (pirell() as any)
      .extend({ double })
      .double()
      .extend({ sumAll })
      .sumAll();

    const result = chain([1, 2, 3]);
    expect(result.value).toBe(12); // (1+2+3)*2
  });

  it("works with object shape [Keyed, ...]", () => {
    const chain = (pirell() as any)
      .extend({ toEntries })
      .toEntries()
      .extend({ flattenEntries })
      .flattenEntries();

    const result = chain({ a: 1, b: 2 });
    expect(result.value).toEqual([1, 2]);
  });

  it("works with nested shape [Keyed, Indexed, ...]", () => {
    const chain = (pirell() as any)
      .extend({ sumValues })
      .sumValues()
      .extend({ toEntries })
      .toEntries();

    const result = chain({ a: [1, 2], b: [3, 4] });
    expect(result.value).toEqual([
      ["a", 3],
      ["b", 7],
    ]);
  });
});

describe("Deferred.pipe / compose (lazy)", () => {
  it("pipe builds a chain, callable with raw JSON", () => {
    const chain = (pirell() as any).pipe(double, sumAll);

    const result = chain([1, 2, 3]);
    expect(result.value).toBe(12);
  });

  it("pipe through shape transitions", () => {
    const chain = (pirell() as any).pipe(toEntries, flattenEntries, double);

    const result = chain({ a: 1, b: 2 });
    expect(result.value).toEqual([2, 4]);
  });

  it("compose builds a chain, callable with raw JSON", () => {
    const chain = (pirell() as any).compose(double, sumAll);

    const result = chain([1, 2, 3]);
    expect(result.value).toBe(12);
  });

  it("compose with shape transitions", () => {
    const chain = (pirell() as any).compose(toEntries, flattenEntries, double);

    const result = chain({ a: 1, b: 2 });
    expect(result.value).toEqual([2, 4]);
  });
});

describe("splitting a chain in two (value reuse)", () => {
  it("one-line chain equals the split chain", () => {
    const entry = (pirell() as any).extend({ double, sumAll });

    const oneLine = entry([1, 2, 3]).double().sumAll();

    const res1 = entry([1, 2, 3]).double();
    const split = entry(res1).sumAll();

    expect(oneLine.value).toBe(12);
    expect(res1.value).toEqual([2, 4, 6]);
    expect(split.value).toBe(12);
  });
});
