// Scenario helpers: emit functions for direct/pipe/wrap forms, the
// stress-file header, and body builders. The *catalog* (which topics
// to measure) lives in the script that uses it — count.mts for per-site
// cost, length.mts for chain length sweep.
// instantiation deltas.

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

export function directChain(data: string, links: string[]): string {
  let expr = data;
  for (const l of links) expr = `${l}()(${expr})`;
  return expr;
}

export function wrapChain(i: number, data: string, links: string[]): string {
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

export function alternatingLinks(len: number): string[] {
  return Array.from({ length: len }, (_, k) =>
    k % 2 === 0 ? "toEntries" : "entriesToObject",
  );
}

export function stressFile(body: string): string {
  return `${HEAD}\n${body}\n`;
}

export function countBody(s: Scenario, n: number): string {
  return Array.from({ length: n }, (_, i) => s.emit(i, s.defaultLen)).join(
    "\n",
  );
}

export function lengthBody(s: Scenario, n: number, len: number): string {
  return Array.from({ length: n }, (_, i) => s.emit(i, len)).join("\n");
}
