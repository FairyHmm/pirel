// Error-verbosity probe: tsc output size for the standard mismatch.
// Deltas only — absolutes are machine-specific (paths).

import { basename } from "node:path";
import { assertTsc, cleanup, compile, tmpFile } from "./tsc.js";

const MISMATCH = `import { pirell } from "../entry/assemble.js";
import { toEntries } from "../ops/fixture-ops.js";
const bad = pirell([1, 2, 3]).extend({ toEntries }).toEntries();
export { bad };
`;

assertTsc();
try {
  const output = compile(MISMATCH);
  const all = output.split("\n");
  const start = all.findIndex((l) => l.includes(basename(tmpFile)));
  // The error block = the stress-file line plus its indented continuation
  // lines (the expanded types live there, not on the first line).
  const block: string[] = [];
  for (let i = start; i < all.length && i >= 0; i++) {
    const l = all[i]!;
    if (i > start && !(l.startsWith(" ") || l.startsWith("\t"))) break;
    block.push(l);
  }
  console.log(`error lines : ${block.length}`);
  console.log(`total chars : ${block.join("\n").length}`);
  console.log(
    `first line  : ${(block[0] ?? "(no error emitted!)").slice(0, 200)}`,
  );
} finally {
  cleanup();
}
