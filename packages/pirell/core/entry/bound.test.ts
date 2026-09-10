import { describe, it, expect, expectTypeOf } from "vitest";
import { pirell } from "./assemble.js";
import {
  double,
  sumAll,
  toEntries,
  entriesToObject,
  sumValues,
  flattenEntries,
} from "../ops/fixture-ops.js";

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

  // Perf finding (PLAN.md "shared ops identity"): .extend()'s per-site
  // type cost (~36/site, HANDOFF Finding 5) comes from Ops being
  // inferred as a FRESH anonymous type at each call site's object
  // literal, not from genericity itself — a shared `const` reference
  // passed to multiple .extend() calls collapses to ~0/site marginal
  // (verified: perf/scratch-final.mts). This test guards the runtime
  // and narrowing behavior stay correct under that pattern.
  it("a shared, reused ops object behaves identically to a fresh literal per call", () => {
    const stdOps = { double, sumAll };
    const a = pirell([1, 2, 3]).extend(stdOps).double();
    const b = pirell([4, 5, 6]).extend(stdOps).double();

    expect(a.value).toEqual([2, 4, 6]);
    expect(b.value).toEqual([8, 10, 12]);
    // Siblings still wired and re-checked fresh off the shared object,
    // same as the fresh-literal path.
    expectTypeOf(a.sumAll).not.toBeNever();
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
    // Regression guard: the mismatch check must fire on the call itself
    // (TS2349), not via the return type — a bare unused binding never
    // constrains a return type, so return-position checks stay silent here.
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
    // double's own Out, not a union: siblings stay wired (re-checked
    // fresh), matching builders.ts threading `ops` through unchanged.
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
    // toEntries was registered alongside entriesToObject, so it's already
    // wired on the narrowed result — no need to re-.extend() it.
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
