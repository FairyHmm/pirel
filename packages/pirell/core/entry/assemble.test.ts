import { describe, it, expect, expectTypeOf } from "vitest";
import { pirell } from "./assemble.js";
import {
  double,
  sumAll,
  toEntries,
  entriesToObject,
  sumValues,
  flattenEntries,
  stringifyValues,
} from "../ops/fixture-ops.js";

describe("Deferred.value typing", () => {
  it("is always undefined, at both runtime and type level", () => {
    const deferred = pirell();
    expect(deferred.value).toBeUndefined();
    expectTypeOf(deferred.value).toEqualTypeOf<undefined>();
  });
});

describe("Wrapper.extend (data-bound)", () => {
  it("wires a fluent method and returns a surface holding the raw result", () => {
    const ext = pirell([1, 2, 3]).extend({ double });
    const result = ext.double();

    expect(result.value).toEqual([2, 4, 6]);
  });

  it("works with object shape [Keyed, ...]", () => {
    const result = pirell({ a: 1, b: 2 }).extend({ toEntries }).toEntries();

    expect(result.value).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("works with nested shape [Keyed, Indexed, ...]", () => {
    const result = pirell({ a: [1, 2], b: [3, 4] })
      .extend({ sumValues })
      .sumValues();

    expect(result.value).toEqual({ a: 3, b: 7 });
  });

  it("chains extends on successive results", () => {
    const entries = pirell({ a: 1, b: 2 }).extend({ toEntries }).toEntries();
    const result = entries.extend({ flattenEntries }).flattenEntries();

    expect(result.value).toEqual([1, 2]);
  });
});

describe("Wrapper.extend always wires; the mismatch surfaces at the call, not registration", () => {
  it(".extend() accepts a mismatched op without complaint", () => {
    // Compile-time only: must type-check clean, no @ts-expect-error.
    if (false) {
      const wired = pirell([1, 2, 3]).extend({ toEntries });
      void wired;
    }
  });

  it("calling the mismatched method is what fails to type-check", () => {
    if (false) {
      // @ts-expect-error -- toEntries expects ["k"], pirell([1,2,3]) is ["i"]
      pirell([1, 2, 3]).extend({ toEntries }).toEntries();
    }
  });

  it("fails to type-check even as a bare unused binding — the check fires on the call, not on how the result is used", () => {
    // Regression guard: Fluent used to type mismatches via a function's
    // RETURN type (() => ShapeMismatch<...>). A plain `const result = ...`
    // with no chained call, no .value access, and no type annotation
    // never constrains that return type, so tsc had no reason to object —
    // the whole rejection was invisible on exactly this, very common,
    // style of use. Fixed by moving the conditional outside the call
    // signature: on mismatch the member isn't a function at all, so the
    // call expression itself is rejected (TS2349), independent of what
    // happens to the result.
    if (false) {
      // @ts-expect-error -- toEntries expects ["k"], pirell([1,2,3]) is ["i"]
      const result = pirell([1, 2, 3]).extend({ toEntries }).toEntries();
      void result;
    }
  });
});

// See PLAN.md "relocate .extend()'s shape check onto Fluent/call-site"
// for the overload-collision bug these tests guard against.
describe("Wrapper.extend with multiple ops registered together", () => {
  it("calling the op that fits the CURRENT shape succeeds", () => {
    const data: [string, number][] = [
      ["a", 1],
      ["b", 2],
    ];
    const twoOp = pirell(data).extend({ entriesToObject, toEntries });
    const result = twoOp.entriesToObject();

    expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it("the fitting op's result is NOT a union across the registered ops' Outs", () => {
    const twoOp = pirell([1, 2, 3]).extend({ double, toEntries });
    const result = twoOp.double();
    // double's own Out ([["i", number]]), not toEntries' — and not a
    // union of the two. Sibling ops registered in the same .extend() call
    // stay wired (re-checked fresh against the narrowed shape) rather
    // than vanishing from the type, matching what's actually still
    // callable at runtime (builders.ts threads `ops` through unchanged).
    expect(result.value).toEqual([2, 4, 6]);
    expectTypeOf(result.double).not.toBeNever();
  });

  it("calling the second op before the first has run (wrong order) fails to type-check", () => {
    if (false) {
      const data = [
        ["a", 1],
        ["b", 2],
      ];
      const twoOp = pirell(data).extend({ entriesToObject, toEntries });
      // @ts-expect-error -- toEntries wants ["k"]; twoOp's shape is still ["i","i..."]
      twoOp.toEntries();
    }
  });

  it("calling in the correct order chains through cleanly", () => {
    const data = [
      ["a", 1],
      ["b", 2],
    ];
    const twoOp = pirell(data).extend({ entriesToObject, toEntries });
    // toEntries was registered alongside entriesToObject in the same
    // .extend() call, so it's already wired on the narrowed result —
    // no need to re-.extend() it. See the runtime-vs-type bug this fixed:
    // Fluent<F,S> used to drop every sibling method on success, even
    // though builders.ts's buildSurface always threads the full `ops`
    // map forward unchanged.
    const result = twoOp.entriesToObject().toEntries();

    expect(result.value).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("Wrapper.pipe (data-bound)", () => {
  it("applies plain functions immediately and returns the raw result", () => {
    const result = (pirell([1, 2, 3]) as any).pipe(double, sumAll);
    expect(result).toBe(12); // (1+2+3)*2
  });

  it("pipes through shape transitions", () => {
    const result = (pirell({ a: 1, b: 2 }) as any).pipe(
      toEntries,
      flattenEntries,
      double,
    );
    expect(result).toEqual([2, 4]);
  });
});

// Bound has no .compose(): it already holds data, so there's no deferred
// state to compose into — see assemble.ts's Assembled<S> comment.
describe("Wrapper.compose (data-bound): intentionally absent", () => {
  it("is not present on a Bound surface", () => {
    const wrapper = pirell([1, 2, 3]) as any;
    expect(wrapper.compose).toBeUndefined();
  });

  it("rejects at the type level too", () => {
    if (false) {
      // @ts-expect-error -- compose() only exists on Deferred, not Bound
      pirell([1, 2, 3]).compose(double, sumAll);
    }
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

describe("Keyed<unknown, 'mixed'> (non-uniform keyed nodes)", () => {
  it("Wrapper: accepts an object with non-uniform values via a mixed-keyed op", () => {
    const data = { name: "alice", age: 30, active: true };
    const result = (pirell(data) as any)
      .extend({ stringifyValues })
      .stringifyValues();

    expect(result.value).toEqual({ name: "alice", age: "30", active: "true" });
  });

  it("Deferred: pipes a mixed-keyed op over a non-uniform object", () => {
    const chain = (pirell() as any).pipe(stringifyValues);

    const result = chain({ x: 1, y: "hello", z: false });
    expect(result.value).toEqual({ x: "1", y: "hello", z: "false" });
  });

  it("chains mixed-keyed -> toEntries -> flattenEntries in a pipe", () => {
    const result = (pirell({ id: 42, label: "foo" }) as any).pipe(
      stringifyValues,
      toEntries,
      flattenEntries,
    );

    expect(result).toEqual(["42", "foo"]);
  });
});
