// Scenario helpers: emit functions, stress-file header, body builders.
// The catalog (which topics) lives in the using script — count.mts for
// per-site cost, length.mts for chain length sweep.

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
  // Chain off the previous *surface*, never a fresh pirell(prev.value):
  // re-wrapping loses the prior op's declared Out (bare-literal ShapeOf
  // can't reconstruct it) and valid links mismatch bogusly.
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
