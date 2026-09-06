import { describe, it, expect } from "vitest";
import { compose, pipe } from "./compose.js";
import type { Raw } from "../types/base.js";
import {
  double,
  sumAll,
  toEntries,
  flattenEntries,
} from "../ops/fixture-ops.js";

describe("compose", () => {
  it("threads a value through a sequence of unary functions", () => {
    const inc = (n: number) => n + 1;
    const double = (n: number) => n * 2;
    const toString = (n: number) => `n=${n}`;

    const run = compose(inc, double, toString);

    expect(run(1)).toBe("n=4"); // (1+1)*2
  });

  it("returns a plain function, not a bound chain", () => {
    const run = compose((n: number) => n + 1);
    expect(typeof run).toBe("function");
    expect(run(5)).toBe(6);
  });

  it("supports arbitrary chain length", () => {
    const run = compose(
      (n: number) => n + 1,
      (n: number) => n * 2,
      (n: number) => n - 3,
      (n: number) => `${n}`,
      (s: string) => s.length,
      (n: number) => n > 0,
    );
    expect(run(1)).toBe(true);
  });

  it("rejects a mismatched chain at the type level", () => {
    const toString = (n: number) => `${n}`;
    const inc = (n: number) => n + 1;
    // @ts-expect-error -- toString's output (string) doesn't match inc's input (number)
    compose(toString, inc);
  });
});

describe("pipe", () => {
  it("applies a sequence of unary functions to data immediately", () => {
    const inc = (n: number) => n + 1;
    const double = (n: number) => n * 2;
    const toString = (n: number) => `n=${n}`;

    expect(pipe(1, inc, double, toString)).toBe("n=4"); // (1+1)*2
  });

  it("returns the result, not a function", () => {
    expect(pipe(5, (n: number) => n + 1)).toBe(6);
  });

  it("supports arbitrary chain length", () => {
    const result = pipe(
      1,
      (n: number) => n + 1,
      (n: number) => n * 2,
      (n: number) => n - 3,
      (n: number) => `${n}`,
      (s: string) => s.length,
      (n: number) => n > 0,
    );
    expect(result).toBe(true);
  });

  it("rejects a mismatched chain at the type level", () => {
    const toString = (n: number) => `${n}`;
    const inc = (n: number) => n + 1;
    // @ts-expect-error -- toString's output (string) doesn't match inc's input (number)
    pipe(1, toString, inc);
  });
});

// pipe/compose also integrate directly with pirell Ops (see shape-inference.md).
// Kept here, not in bound/deferred/mixed.test.ts: those only wire surfaces together.
describe("standalone pipe/compose with pirell Ops", () => {
  it("pipe(data, fns) works directly on raw JSON", () => {
    // No cast — ShapeOf derives [["i", number]] from the number[] literal
    // directly (non-union primitive leaf), matching double/sumAll's claim.
    const result = pipe([1, 2, 3], double, sumAll);
    expect(result).toBe(12);
  });

  it("compose(fns)(data) works directly on raw JSON", () => {
    const result = compose(double, sumAll)([1, 2, 3]);
    expect(result).toBe(12);
  });

  it("pipe shape-gates a bare literal, no cast", () => {
    // No `as Raw<...>` — the Op-first overload checks the data's own
    // derived shape against the first op's In. toEntries/flattenEntries
    // don't inspect value type, so no Branch claim, no cast needed here.
    const flat = pipe({ a: 1, b: 2 }, toEntries, flattenEntries);
    expect(flat).toEqual([1, 2]);
  });

  it("compose with a prior op's raw output, seam cast to double's claim", () => {
    // compose yields (data: Raw<In>) => Raw<Out>; an object literal can't
    // assign to the Raw<["k"]> brand (excess-property check), so it is fed
    // by a prior op's raw output instead — the cast-free compose path.
    // flattenEntries' Out is ["i"] (no element-type claim); double now
    // claims [["i", number]] — bridging that seam is an explicit cast,
    // not an inferred continuation (see fixture-ops.ts).
    const entries = toEntries()({ a: 1, b: 2 }) as Raw<["i", "i..."]>;
    const flat = flattenEntries()(entries) as unknown as Raw<[["i", number]]>;
    const result = double()(flat);
    expect(result).toEqual([2, 4]);
  });
});

describe("standalone pipe/compose shape rejection (compile-time)", () => {
  it("rejects bare array data into an op expecting a keyed shape", () => {
    // Type check only — never runs.
    if (false) {
      // @ts-expect-error toEntries expects ["k"], not the derived ["i"]
      pipe([1, 2, 3], toEntries);
    }
  });

  it("rejects keyed data into an op expecting an indexed shape", () => {
    // Type check only — never runs.
    if (false) {
      // @ts-expect-error double expects [["i", number]], not the derived ["k"]
      pipe({ a: 1 }, double);
    }
  });

  it("rejects a compose link whose Out can't feed the next In", () => {
    // Type check only — never runs.
    if (false) {
      // @ts-expect-error double Out [["i", number]] can't feed toEntries In ["k"]
      compose(double, toEntries);
      // @ts-expect-error double Out [["i", number]] can't feed flattenEntries In ["i","i..."]
      compose(double, flattenEntries);
      // @ts-expect-error flattenEntries Out ["i"] (no element claim) can't feed double In [["i", number]]
      compose(flattenEntries, double);
    }
  });

  it("rejects a chain narrowed by a mismatched final element", () => {
    // Type check only — never runs.
    if (false) {
      // @ts-expect-error toEntries (["k"] -> ["i","i..."]) then double needs [["i", number]], mismatch
      pipe({ a: 1 }, toEntries, double);
    }
  });

  it("compose shape-gates bare object data (no cast needed)", () => {
    if (false) {
      // @ts-expect-error toEntries expects ["k"], not ["i"] from bare array
      compose(toEntries)([1, 2, 3]);
      // @ts-expect-error double expects [["i", number]], not ["k"] from bare object
      compose(double)({ a: 1 });
    }
  });
});

// A spread array of ops (as opposed to a literal `pipe(data, a, b)` call)
// widens to Fns["length"]: number, which TypeScript can't type-check
// per-link (see chain.ts's ComposeChain non-tuple branch) — there is no
// runtime shape tag on Op to check it there either (brand-removal is
// intentional, see PLAN.md). This describes what actually happens instead:
// a clear, stage-labeled error rather than a bare crash from deep inside
// whichever op's body first chokes on the wrong shape.
describe("compose/pipe: unchecked spread-array chains fail loudly", () => {
  it("wraps a stage's runtime error with stage index and cause", () => {
    const fns: Array<typeof double> = [double];
    expect(() => pipe({ a: 1 } as any, ...fns)).toThrow(/stage 0 threw/);
  });

  it("preserves the original error as `cause`", () => {
    const fns: Array<typeof double> = [double];
    try {
      pipe({ a: 1 } as any, ...fns);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause).toBeInstanceOf(TypeError);
    }
  });

  it("a well-typed spread-array chain still works normally", () => {
    const fns: Array<typeof double> = [double];
    const result = pipe([1, 2, 3], ...fns);
    expect(result).toEqual([2, 4, 6]);
  });
});
