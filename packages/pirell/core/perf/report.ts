// Generic table rendering and number formatting. Shared by the probe
// (tsc instantiation deltas) and the bench (runtime µs/call).

export const fmt = (n: number): string => n.toLocaleString("en-US");

// Constant-width tables: callers collect head + rows first, then every
// column pads to its widest cell. A "\t" cell splits left-align /
// right-align (counts flush one edge, times the other).
export function renderTable(head: string[], rows: string[][]): string {
  const split = (c: string): [string, string] => {
    const i = c.indexOf("\t");
    return i < 0 ? [c, ""] : [c.slice(0, i), c.slice(i + 1)];
  };
  const widths = head.map((h, i) => {
    const parts = rows.map((r) => split(r[i] ?? ""));
    const leftW = Math.max(...parts.map((p) => p[0].length));
    const rightW = Math.max(...parts.map((p) => p[1].length));
    return Math.max(h.length, leftW + (rightW > 0 ? 1 + rightW : 0), 3);
  });
  const cell = (c: string, i: number): string => {
    const total = widths[i]!;
    const [left, right] = split(c);
    if (!right) return left.padEnd(total);
    const rightW = total - left.length - 1;
    return `${left} ${right.padStart(Math.max(right.length, rightW))}`;
  };
  const line = (cells: string[]): string =>
    `| ${cells.map((c, i) => cell(c, i)).join(" | ")} |`;
  const divider = `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`;
  return [line(head), divider, ...rows.map(line)].join("\n");
}

export const countCell = (inst: number, checkSecs: number): string =>
  `${fmt(inst)}\t ${Math.round(checkSecs * 1000)}ms`;
