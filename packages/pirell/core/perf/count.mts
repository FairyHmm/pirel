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

// Wrap breakdown: isolate pirell-only, pirell+extend, pirell+extend+call
// to show how the wrap marginal distributes across the surface lifecycle.
function wrapBreakdown(t: Topic): Scenario[] {
  const { name, data, links } = t;
  return [
    {
      name: `${name}-pirell`,
      summary: `pirell(data) only — no extend, no call.`,
      emit: (i) => `const s${i} = pirell(${data(i)});`,
      defaultLen: 1,
      sweepLen: false,
      sweepPerChain: false,
    },
    {
      name: `${name}-extend`,
      summary: `pirell(data).extend({...}) — pirell + extend, no call.`,
      emit: (i) => `const s${i} = pirell(${data(i)}).extend({ ${links[0]} });`,
      defaultLen: 1,
      sweepLen: false,
      sweepPerChain: false,
    },
    {
      name: `${name}-call`,
      summary: `pirell(data).extend({...}).op() — pirell + extend + call (no .value).`,
      emit: (i) => `const s${i} = pirell(${data(i)}).extend({ ${links[0]} }).${links[0]}();`,
      defaultLen: 1,
      sweepLen: false,
      sweepPerChain: false,
    },
  ];
}

// Stable-type demo: named interface Row (not inline literal). Tests
// whether the per-site freshness floor (75/site for fresh object
// literals) is reachable via usage-side type stability — no core
// change needed.
const STABLE_PREFIX = "interface Row { a: number; k: number; }";

const stableBreakdown: Scenario[] = [
  {
    name: "obj-stable",
    summary: `Named interface Row (not inline literal) → toEntries.`,
    emit: (i) => {
      const v = `r${i}`;
      return `const ${v}: Row = { a: 1, k: ${i} }; const s${i} = pirell(${v}).extend({ toEntries }).toEntries().value;`;
    },
    defaultLen: 1,
    sweepLen: false,
    sweepPerChain: false,
  },
  {
    name: "obj-stable-pirell",
    summary: `Named interface Row, pirell only.`,
    emit: (i) => {
      const v = `r${i}`;
      return `const ${v}: Row = { a: 1, k: ${i} }; const s${i} = pirell(${v});`;
    },
    defaultLen: 1,
    sweepLen: false,
    sweepPerChain: false,
  },
];

const SCENARIOS: Scenario[] = [
  // Wrap breakdown for single (array, one op): isolates pirell-only,
  // pirell+extend, pirell+extend+call. Shows how the 36/site wrap
  // marginal distributes across the surface lifecycle.
  ...wrapBreakdown({
    name: "single",
    data: () => "[1,2,3]",
    links: ["double"],
  }),
  ...topicScenarios({
    name: "single",
    data: () => "[1,2,3]",
    links: ["double"],
  }),
  // Wrap breakdown for obj (uniform object, one op): shows how the
  // 111/site obj-wrap marginal distributes. Compare with single's
  // breakdown to see where the ~75 fresh-object-literal cost lives
  // (pirell? extend? call?).
  ...wrapBreakdown({
    name: "obj",
    data: (i) => `{a:1,k${i}:2}`,
    links: ["toEntries"],
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
  // Wrap breakdown for mixed1 (mixed object, one op): shows how the
  // 89/site mixed1-wrap marginal distributes. Mixed is cheaper than
  // uniform because bare ["k..."] has no Branch payload to construct.
  ...wrapBreakdown({
    name: "mixed1",
    data: (i) => `{a:1,b:"x",k${i}:true}`,
    links: ["stringifyValues"],
  }),
  ...topicScenarios({
    name: "mixed1",
    data: (i) => `{a:1,b:"x",k${i}:true}`,
    links: ["stringifyValues"],
  }),
  // Stable-type demo: named interface Row (not inline literal). Tests
  // whether the per-site freshness floor (75/site for fresh object
  // literals) is reachable via usage-side type stability — no core
  // change needed.
  ...stableBreakdown,
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
      const isStable = s.name.startsWith("obj-stable");
      const body = isStable
        ? `${STABLE_PREFIX}\n${countBody(s, counts[counts.length - 1]!)}`
        : countBody(s, counts[counts.length - 1]!);
      const results = counts.map((n) => {
        const b = isStable
          ? `${STABLE_PREFIX}\n${countBody(s, n)}`
          : countBody(s, n);
        return measure(stressFile(b));
      });
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
