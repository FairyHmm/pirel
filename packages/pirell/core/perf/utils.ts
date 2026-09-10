import { parseFlags } from "./args.js";
import { countCell, fmt, renderTable } from "./report.js";
import { assertTsc, cleanup, compile, tscVersion } from "./tsc.js";

const USAGE = `Type-cost probe: measures tsc instantiation deltas for synthetic call-site matrices.

Usage: npm run perf:count [--flags]   (call-site count)
       npm run perf:length [--flags]  (chain length sweep)
  (from packages/pirell/core; pnpm/npm need "--" first)
  --counts 1,25,50        call-site counts per scenario (default "1,25,50")
  --only a,b              run a subset of scenarios
  --forms direct,pipe     filter by form (direct, pipe, wrap)
  --chain-lengths 1,4,8   sweep chain length, holding call sites at --chain-calls
  --chain-calls 60        call sites per length-sweep measurement (default 60)
  -h, --help              print this and exit`;

export interface Args {
  counts: number[];
  only: Set<string> | null;
  forms: Set<string> | null;
  chainLengths: number[];
  chainCalls: number;
}

function parseIntList(value: string, flag: string, min: number): number[] {
  const out = value.split(",").map(Number);
  if (out.some((n) => !Number.isInteger(n) || n < min))
    throw new Error(`${flag} must be comma-separated integers ≥ ${min}`);
  return out;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = {
    counts: [1, 25, 50],
    only: null,
    forms: null,
    chainLengths: [1, 4, 8],
    chainCalls: 60,
  };
  const f = parseFlags(
    argv,
    {
      withValue: ["counts", "only", "forms", "chain-lengths", "chain-calls"],
      boolean: [],
    },
    USAGE,
  );
  const counts = f.value("counts");
  if (counts) out.counts = parseIntList(counts, "--counts", 1);
  const only = f.value("only");
  if (only) out.only = new Set(only.split(","));
  const forms = f.value("forms");
  if (forms) out.forms = new Set(forms.split(","));
  const lengths = f.value("chain-lengths");
  if (lengths) out.chainLengths = parseIntList(lengths, "--chain-lengths", 1);
  const calls = f.value("chain-calls");
  if (calls) {
    const [n] = parseIntList(calls, "--chain-calls", 1);
    out.chainCalls = n!;
  }
  return out;
}

export interface Measurement {
  inst: number;
  check: number;
  types: number;
}

export function measure(fileContent: string): Measurement {
  const stdout = compile(fileContent, ["--extendedDiagnostics"]);
  // Errors in the stress file invalidate the measurement (error paths
  // instantiate different types); errors in library sources during an
  // ablation: warn, measure anyway.
  const errLines = stdout
    .split("\n")
    .filter((l) => l.includes("stress.tmp.ts") && l.includes("error TS"))
    .slice(0, 5);
  if (errLines.length > 0)
    throw new Error(
      `tsc reported errors in the stress file, measurement invalid:\n${errLines.join("\n")}`,
    );
  const other = stdout
    .split("\n")
    .filter((l) => l.includes("error TS")).length;
  if (other > 0)
    console.log(
      `(note: ${other} error(s) outside the stress file — ignored)`,
    );
  const inst = Number(stdout.match(/Instantiations:\s+(\d+)/)?.[1]);
  const check = Number(stdout.match(/Check time:\s+([\d.]+)s/)?.[1]);
  const types = Number(stdout.match(/^Types:\s+(\d+)/m)?.[1]);
  if (!Number.isFinite(inst))
    throw new Error("could not parse tsc --extendedDiagnostics output");
  return {
    inst,
    check: Number.isFinite(check) ? check : 0,
    types: Number.isFinite(types) ? types : 0,
  };
}

export function typesMarginal(
  typeDeltas: number[],
  units: number[],
  divisor: number,
): string {
  const dLast = typeDeltas.at(-1) ?? 0;
  const dPrev = typeDeltas.length > 1 ? (typeDeltas.at(-2) ?? 0) : 0;
  const uLast = (units.at(-1) ?? 0) * divisor;
  const uPrev = units.length > 1 ? (units.at(-2) ?? 0) * divisor : 0;
  return typeDeltas.length > 1 && uLast > uPrev
    ? `~${((dLast - dPrev) / (uLast - uPrev)).toFixed(1)}`
    : "—";
}

export function countsHead(counts: number[]): string[] {
  return [
    "Scenario",
    ...counts.map((n) => (n === 1 ? "n=1 (cold)" : `n=${n}`)),
    "Growth",
    "Marginal",
    "Types",
  ];
}

export function countsRow(
  name: string,
  deltas: number[],
  checks: number[],
  counts: number[],
  typeDeltas: number[],
): string[] {
  const dLast = deltas.at(-1) ?? 0;
  const dPrev = deltas.length > 1 ? (deltas.at(-2) ?? 0) : 0;
  const nLast = counts.at(-1) ?? 0;
  const nPrev = counts.length > 1 ? (counts.at(-2) ?? 0) : 0;
  const steady =
    deltas.length > 1 && dPrev > 0 && nLast > nPrev
      ? [
          `${(dLast / dPrev).toFixed(2)}×`,
          `~${((dLast - dPrev) / (nLast - nPrev)).toFixed(1)}`,
        ]
      : ["—", "—"];
  return [
    name,
    ...deltas.map((d, k) => countCell(d, checks[k]!)),
    ...steady,
    typesMarginal(typeDeltas, counts, 1),
  ];
}

export function lengthsHead(lengths: number[], calls: number): string[] {
  return [
    `Scenario (${calls} calls)`,
    ...lengths.map((l) => `len=${l}`),
    "Marginal",
    "Types",
  ];
}

export function lengthsRow(
  name: string,
  deltas: number[],
  checks: number[],
  lengths: number[],
  divisor: number,
  typeDeltas: number[],
): string[] {
  const dLast = deltas.at(-1) ?? 0;
  const dPrev = deltas.length > 1 ? (deltas.at(-2) ?? 0) : 0;
  const lLast = lengths.at(-1) ?? 0;
  const lPrev = lengths.length > 1 ? (lengths.at(-2) ?? 0) : 0;
  const steady =
    deltas.length > 1 && lLast > lPrev
      ? `~${((dLast - dPrev) / ((lLast - lPrev) * divisor)).toFixed(2)}`
      : "—";
  return [
    name,
    ...deltas.map((d, k) => countCell(d, checks[k]!)),
    steady,
    typesMarginal(typeDeltas, lengths, divisor),
  ];
}

export function assertAndVersion(): string {
  assertTsc();
  return tscVersion();
}

export { fmt, renderTable, cleanup };
