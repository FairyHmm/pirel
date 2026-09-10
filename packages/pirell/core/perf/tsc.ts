// tsc compile seam for count/length (parsed counts) + errsize (verbosity).
// `perf/**` is publish-excluded.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const tscBin = join(coreDir, "node_modules", ".bin", "tsc");
const probeConfig = join(coreDir, "tsconfig.probe.json");
export const tmpFile = join(coreDir, "perf", "stress.tmp.ts");

export function assertTsc(): void {
  if (!existsSync(tscBin))
    throw new Error(`tsc not found at ${tscBin} — run install first`);
}

export function tscVersion(): string {
  return execFileSync(tscBin, ["--version"], {
    cwd: coreDir,
    encoding: "utf8",
  }).trim();
}

/** Write fileContent to the stress file, run tsc on the probe config,
 * return stdout (or stdout+stderr when tsc exits non-zero on errors). */
export function compile(fileContent: string, extraArgs: string[] = []): string {
  writeFileSync(tmpFile, fileContent);
  let stdout: string;
  try {
    stdout = execFileSync(tscBin, ["-p", probeConfig, ...extraArgs], {
      cwd: coreDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // tsc exits non-zero on type errors — the caller still needs the text.
    const e = err as { stdout?: unknown; stderr?: unknown };
    stdout = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  return stdout;
}

export function cleanup(): void {
  if (existsSync(tmpFile)) rmSync(tmpFile);
}
