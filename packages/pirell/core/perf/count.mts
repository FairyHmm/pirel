// Type-cost probe (call-site count): tsc instantiation deltas as the
// number of distinct call sites grows. One op per topic, distinct data
// types per site — pure per-site cost. `npm run perf:count -- --help`
// for flags. `perf/**` is publish-excluded.

import {
  type Scenario,
  countBody,
  directChain,
  stressFile,
  wrapChain,
} from "./scenarios.js";
import {
  assertAndVersion,
  cleanup,
  countsHead,
  countsRow,
  fmt,
  measure,
  parseArgs,
  renderTable,
} from "./utils.js";

// --- Call-site count catalog (single op, distinct data per site) ---

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

const SCENARIOS: Scenario[] = [
  ...topicScenarios({
    name: "single",
    data: () => "[1,2,3]",
    links: ["double"],
  }),
  ...topicScenarios({
    name: "obj",
    data: (i) => `{a:1,k${i}:2}`,
    links: ["toEntries"],
  }),
  // 3-key uniform object → toEntries: matches mixed1's key count (3)
  // to separate key-count effect from mixed-values effect when comparing
  // obj-vs-mixed1. Same op as obj, only key count differs.
  ...topicScenarios({
    name: "obj3-u",
    data: (i) => `{a:1,b:2,k${i}:3}`,
    links: ["toEntries"],
  }),
  ...topicScenarios({
    name: "mixed1",
    data: (i) => `{a:1,b:"x",k${i}:true}`,
    links: ["stringifyValues"],
  }),
];

function findScenario(name: string): Scenario {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found) throw new Error(`unknown scenario: ${name}`);
  return found;
}

// --- Orchestration ---

function main(): void {
  const version = assertAndVersion();
  const { counts, only, forms } = parseArgs(process.argv.slice(2));
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
      `Type-cost probe — call-site count (${version}; baseline ${fmt(baseline.inst)} inst, ${baseline.check}s check)\n`,
    );
    const rows: string[][] = [];
    for (const name of names) {
      const s = findScenario(name);
      const results = counts.map((n) => measure(stressFile(countBody(s, n))));
      const deltas = results.map((r) => r.inst - baseline.inst);
      rows.push(
        countsRow(
          name,
          deltas,
          results.map((r) => r.check),
          counts,
          results.map((r) => r.types - baseline.types),
        ),
      );
    }
    console.log(renderTable(countsHead(counts), rows));
  } finally {
    cleanup();
  }
}

main();
