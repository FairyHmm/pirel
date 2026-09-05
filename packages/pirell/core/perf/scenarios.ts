// Scenario catalog: one topic per (functions, data), three forms each —
// direct (nested op calls), pipe (data-first gate), wrap (pirell Fluent
// extend+call) — named <topic>-<form>. Object scenarios embed the call
// index in a same-typed extra key (`k${i}`) so each D is distinct while
// the derived Shape is identical. Wrap chains re-wrap through .value
// (erases the data type — flat marginals even with distinct D).

export const HEAD = [
  'import { pipe, compose } from "../entry/compose.js";',
  'import { pirell } from "../entry/assemble.js";',
  'import { double, sumAll, toEntries, entriesToObject, flattenEntries, sumValues, stringifyValues } from "../ops/fixture-ops.js";',
].join("\n");

export interface Scenario {
  name: string;
  summary: string;
  emit: (i: number, len: number) => string;
  defaultLen: number;
  sweepLen: boolean;
  /** True = identical calls cache to one chain (slope is per-chain, not per-link-per-call). */
  sweepPerChain: boolean;
}

// --- Helpers ---

function directChain(data: string, links: string[]): string {
  let expr = data;
  for (const l of links) expr = `${l}()(${expr})`;
  return expr;
}

function wrapChain(i: number, data: string, links: string[]): string {
  // Chain .extend({link}).link() fluently off the previous *surface*,
  // never through a fresh pirell(prev.value) re-wrap: pirell(x) infers a
  // shape via bare-literal ShapeOf<T>, which doesn't reconstruct a prior
  // op's declared Out (e.g. toEntries' ["i","i..."]) — re-wrapping loses
  // exactly the shape info the next link's Fluent check needs, and
  // surfaces as a bogus ShapeMismatch even on links that chain validly
  // (confirmed: direct/pipe forms of the same link lists compile clean).
  // Fluent<F,S> already checks In against the pre-extend surface's own
  // CurrentShp, so staying on the surface is both correct and cheaper.
  const lines: string[] = [];
  let cur = `pirell(${data})`;
  links.forEach((l, k) => {
    const v = k === links.length - 1 ? `s${i}` : `s${i}_${k}`;
    lines.push(`const ${v} = ${cur}.extend({ ${l} }).${l}();`);
    cur = v;
  });
  return lines.join("\n");
}

function alternatingLinks(len: number): string[] {
  return Array.from({ length: len }, (_, k) =>
    k % 2 === 0 ? "toEntries" : "entriesToObject",
  );
}

// --- Topic → three forms ---

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

// --- Fixed-length topics ---

const FIXED: Scenario[] = [
  ...topicScenarios({ name: "single", data: () => "[1,2,3]", links: ["double"] }),
  ...topicScenarios({ name: "obj", data: (i) => `{a:1,k${i}:2}`, links: ["toEntries"] }),
  ...topicScenarios({ name: "chain2", data: () => "[1,2,3]", links: ["double", "sumAll"] }),
  // sumValues→toEntries: sumValues' uniform output feeds toEntries (bare ["k"]).
  ...topicScenarios({ name: "deep2", data: (i) => `{a:[1,2],b:[3],k${i}:[4]}`, links: ["sumValues", "toEntries"] }),
  ...topicScenarios({ name: "chain4", data: (i) => `{a:1,b:2,k${i}:3}`, links: ["toEntries", "entriesToObject", "toEntries", "flattenEntries"] }),
  ...topicScenarios({ name: "mixed1", data: (i) => `{a:1,b:"x",k${i}:true}`, links: ["stringifyValues"] }),
];

// --- Length-sweep topics ---

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
      emit: (i, len) => `const s${i} = pipe(${data(i)}, ${links(len).join(", ")});`,
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

const SWEEP: Scenario[] = [
  ...sweepScenarios({ name: "chainN", data: (i) => `{a:1,b:2,k${i}:3}`, links: alternatingLinks, sweepPerChain: false }),
  ...sweepScenarios({ name: "sameN", data: () => "[1,2,3]", links: (len) => Array.from({ length: len }, () => "double"), sweepPerChain: true }),
];

// --- Exported catalog ---

export const SCENARIOS: Scenario[] = [...FIXED, ...SWEEP];

export function findScenario(name: string): Scenario {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found) throw new Error(`unknown scenario: ${name}`);
  return found;
}

export function stressFile(body: string): string {
  return `${HEAD}\n${body}\n`;
}

export function countBody(s: Scenario, n: number): string {
  return Array.from({ length: n }, (_, i) => s.emit(i, s.defaultLen)).join("\n");
}

export function lengthBody(s: Scenario, n: number, len: number): string {
  return Array.from({ length: n }, (_, i) => s.emit(i, len)).join("\n");
}
