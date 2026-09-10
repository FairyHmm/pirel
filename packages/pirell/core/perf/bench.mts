// Runtime bench: wall time per call for the three forms (what users
// feel). Min-across-runs primary (pauses only ever add).

import { pipe } from "../entry/compose.js";
import { pirell } from "../entry/assemble.js";
import { double, sumAll, toEntries } from "../ops/fixture-ops.js";
import { parseFlags } from "./args.js";
import { fmt, renderTable } from "./report.js";

const USAGE = `Runtime bench: µs/call (min across runs) for the three forms, adaptive iters.

Usage: npm run perf:bench [--flags]   (from packages/pirell/core; npm needs "--" first)
  --case name             run a single case (fresh-process A/B on disputes)
  --all                   full matrix (default: the 7 lean headline cases)
  -h, --help              print this and exit`;

const RUNS = 9;
const TARGET_MS = 250;
const MIN_ITERS = 1_000;
const MAX_ITERS = 2_000_000;

interface Case {
  name: string;
  headline: boolean;
  run: () => unknown;
}

// Blackhole: defeat dead-code elimination without I/O in the loop.
let sink: unknown = null;

const SMALL_ARR = [1, 2, 3] as const;
const BIG_ARR: number[] = Array.from({ length: 10_000 }, (_, i) => i);
const OBJ = { a: 1, b: 2 };

const CASES: Case[] = [
  {
    name: "single-direct",
    headline: true,
    run: () => double()([...SMALL_ARR] as unknown as number[]),
  },
  {
    name: "single-pipe",
    headline: true,
    run: () => pipe([...SMALL_ARR] as unknown as number[], double),
  },
  {
    name: "single-wrap",
    headline: true,
    run: () =>
      pirell([...SMALL_ARR] as unknown as number[])
        .extend({ double })
        .double().value,
  },
  {
    name: "chain2-direct",
    headline: false,
    run: () => sumAll()(double()([...SMALL_ARR] as unknown as number[])),
  },
  {
    name: "chain2-pipe",
    headline: false,
    run: () => pipe([...SMALL_ARR] as unknown as number[], double, sumAll),
  },
  {
    name: "chain2-wrap",
    headline: true,
    run: () =>
      pirell([...SMALL_ARR] as unknown as number[])
        .extend({ double })
        .double()
        .extend({ sumAll })
        .sumAll().value,
  },
  {
    name: "obj-direct",
    headline: false,
    run: () => toEntries()({ ...OBJ }),
  },
  {
    name: "obj-pipe",
    headline: false,
    run: () => pipe({ ...OBJ }, toEntries),
  },
  {
    name: "obj-wrap",
    headline: true,
    run: () =>
      pirell({ ...OBJ })
        .extend({ toEntries })
        .toEntries().value,
  },
  {
    name: "big-direct",
    headline: true,
    run: () => double()(BIG_ARR.slice()),
  },
  {
    name: "big-pipe",
    headline: false,
    run: () => pipe(BIG_ARR.slice(), double),
  },
  {
    name: "big-wrap",
    headline: true,
    run: () => pirell(BIG_ARR.slice()).extend({ double }).double().value,
  },
];

const gc = (globalThis as { gc?: () => void }).gc;

function calibrate(run: () => unknown): number {
  const PROBE = 2_000;
  const t0 = performance.now();
  for (let i = 0; i < PROBE; i++) sink = run();
  const perCallMs = (performance.now() - t0) / PROBE;
  return Math.min(
    MAX_ITERS,
    Math.max(MIN_ITERS, Math.round(TARGET_MS / Math.max(perCallMs, 1e-9))),
  );
}

const flags = parseFlags(
  process.argv.slice(2),
  { withValue: ["case"], boolean: ["all"] },
  USAGE,
);
const only = flags.value("case");
const all = flags.bool("all");

const mins = new Map<string, number>();
const rows: string[][] = [];
for (const c of CASES) {
  if (only && c.name !== only) continue;
  if (!only && !all && !c.headline) continue;
  // Warmup (JIT, caches) outside the clock.
  for (let i = 0; i < 10_000; i++) sink = c.run();
  const iters = calibrate(c.run);
  const perCall: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    gc?.();
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) sink = c.run();
    perCall.push(((performance.now() - t0) / iters) * 1000);
  }
  perCall.sort((a, b) => a - b);
  const min = perCall[0]!;
  const med = perCall[Math.floor(perCall.length / 2)]!;
  mins.set(c.name, min);
  rows.push([c.name, min.toFixed(1), med.toFixed(1), fmt(iters)]);
}
console.log(
  renderTable(
    [`Scenario (runs=${RUNS})`, "min µs/call", "median µs/call", "iters"],
    rows,
  ),
);
// Ratios cancel machine drift. Pipe is the reference (direct sits at
// the timer floor). Meaningful only when the reference cases ran.
const ratio = (a?: number, b?: number): string =>
  a !== undefined && b !== undefined && b > 0 ? `${(a / b).toFixed(0)}×` : "—";
if (!only)
  console.log(
    `wrap:pipe  single ${ratio(mins.get("single-wrap"), mins.get("single-pipe"))}` +
      `  chain2 ${ratio(mins.get("chain2-wrap"), mins.get("single-pipe"))}` +
      `  obj ${ratio(mins.get("obj-wrap"), mins.get("single-pipe"))}` +
      `  big ${ratio(mins.get("big-wrap"), mins.get("big-direct"))}`,
  );
console.log(`(sink: ${typeof sink})`);
