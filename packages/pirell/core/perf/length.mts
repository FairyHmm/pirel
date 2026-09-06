// Type-cost probe (chain length sweep): tsc instantiation deltas as the
// chain length grows (each link applied to the same data, call sites held
// constant). Covers both fixed-length chains (chain2, deep2) and
// sweepable chains (chainN, sameN). `npm run perf:length -- --help`
// for flags. `perf/**` is publish-excluded.

import {
  type Scenario,
  alternatingLinks,
  directChain,
  lengthBody,
  stressFile,
  wrapChain,
} from "./scenarios.js";
import {
  assertAndVersion,
  cleanup,
  fmt,
  lengthsHead,
  lengthsRow,
  type Measurement,
  measure,
  parseArgs,
  renderTable,
} from "./utils.mts";

// --- Chain length catalog ---

interface Topic {
  name: string;
  data: (i: number) => string;
  links: string[];
}

function topicScenarios(t: Topic): Scenario[] {
  const { name, data, links } = t;
  return [
    {
      name: `${name}-direct`,
      summary: `Direct ${links.join("→")}.`,
      emit: (i) => `const s${i} = ${directChain(data(i), links)};`,
      defaultLen: links.length,
      sweepLen: false,
      sweepPerChain: false,
    },
    {
      name: `${name}-pipe`,
      summary: `Pipe ${links.join("→")}.`,
      emit: (i) => `const s${i} = pipe(${data(i)}, ${links.join(", ")});`,
      defaultLen: links.length,
      sweepLen: false,
      sweepPerChain: false,
    },
    {
      name: `${name}-wrap`,
      summary: `Wrap ${links.join("→")} via pirell Fluent.`,
      emit: (i) => wrapChain(i, data(i), links),
      defaultLen: links.length,
      sweepLen: false,
      sweepPerChain: false,
    },
  ];
}

interface SweepTopic {
  name: string;
  data: (i: number) => string;
  links: (len: number) => string[];
  sweepPerChain: boolean;
}

function sweepScenarios(t: SweepTopic): Scenario[] {
  const { name, data, links, sweepPerChain } = t;
  return [
    {
      name: `${name}-direct`,
      summary: `Direct length-sweepable chain.`,
      emit: (i, len) => `const s${i} = ${directChain(data(i), links(len))};`,
      defaultLen: 4,
      sweepLen: true,
      sweepPerChain,
    },
    {
      name: `${name}-pipe`,
      summary: `Pipe length-sweepable chain.`,
      emit: (i, len) =>
        `const s${i} = pipe(${data(i)}, ${links(len).join(", ")});`,
      defaultLen: 4,
      sweepLen: true,
      sweepPerChain,
    },
    {
      name: `${name}-wrap`,
      summary: `Wrap length-sweepable chain.`,
      emit: (i, len) => wrapChain(i, data(i), links(len)),
      defaultLen: 4,
      sweepLen: true,
      sweepPerChain,
    },
  ];
}

const FIXED: Scenario[] = [
  // Two-op fixed chains.
  ...topicScenarios({
    name: "chain2",
    data: () => "[1,2,3]",
    links: ["double", "sumAll"],
  }),
  ...topicScenarios({
    name: "deep2",
    data: (i) => `{a:[1,2],b:[3],k${i}:[4]}`,
    links: ["sumValues", "toEntries"],
  }),
];

const SWEEP: Scenario[] = [
  // Alternating ops, sweepable length.
  ...sweepScenarios({
    name: "alternating",
    data: (i) => `{a:1,b:2,k${i}:3}`,
    links: alternatingLinks,
    sweepPerChain: false,
  }),
  // Same op repeated, caches to one chain (per-chain slope).
  ...sweepScenarios({
    name: "same-op",
    data: () => "[1,2,3]",
    links: (len) => Array.from({ length: len }, () => "double"),
    sweepPerChain: true,
  }),
];

const SCENARIOS: Scenario[] = [...FIXED, ...SWEEP];

function findScenario(name: string): Scenario {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found) throw new Error(`unknown scenario: ${name}`);
  return found;
}

// --- Orchestration ---

function main(): void {
  const version = assertAndVersion();
  const { only, forms, chainLengths, chainCalls } = parseArgs(
    process.argv.slice(2),
  );
  if (only) for (const name of only) findScenario(name);
  const names = SCENARIOS.map((s) => s.name).filter(
    (n) =>
      (!only || only.has(n)) &&
      (!forms || forms.has(n.slice(n.lastIndexOf("-") + 1))),
  );

  try {
    const baseline = measure(
      stressFile("// baseline: same imports, zero call sites"),
    );
    console.log(
      `Type-cost probe — chain length (${version}; baseline ${fmt(baseline.inst)} inst, ${baseline.check}s check)\n`,
    );
    console.log(`Length sweep (call sites held at ${chainCalls}):`);
    const rows: string[][] = [];
    for (const name of names) {
      const s = findScenario(name);
      const results: Measurement[] = chainLengths.map((len: number) =>
        measure(stressFile(lengthBody(s, chainCalls, len))),
      );
      const deltas = results.map((r) => r.inst - baseline.inst);
      rows.push(
        lengthsRow(
          s.sweepPerChain ? `${s.name} †` : s.name,
          deltas,
          results.map((r) => r.check),
          chainLengths,
          s.sweepPerChain ? 1 : chainCalls,
          results.map((r) => r.types - baseline.types),
        ),
      );
    }
    if (rows.length > 0)
      console.log(renderTable(lengthsHead(chainLengths, chainCalls), rows));
    const perChain = names
      .map(findScenario)
      .filter((s) => s.sweepPerChain)
      .map((s) => s.name);
    if (perChain.length > 0)
      console.log(
        `(† ${perChain.join(", ")}: identical calls cache to one chain, so the slope is per-chain (cold) — not per-link-per-call, do not subtract it from distinct-D slopes)`,
      );
  } finally {
    cleanup();
  }
}

main();
