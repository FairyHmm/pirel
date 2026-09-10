// Shared flag parsing for the perf tools. Mechanics live here once:
// `--` separator, `--flag value`/`=value`, booleans, `-h/--help`.

export interface FlagSpec {
  withValue: readonly string[];
  boolean: readonly string[];
}

/** Accessors over the parsed flags; null/false when absent. */
export interface ParsedFlags {
  value: (name: string) => string | null;
  bool: (name: string) => boolean;
}

export function parseFlags(
  argv: string[],
  spec: FlagSpec,
  usage?: string,
): ParsedFlags {
  const values = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") continue; // pass-through separator
    if (arg === "-h" || arg === "--help") {
      if (usage) {
        console.log(usage);
        process.exit(0);
      }
      continue;
    }
    const [raw = arg, inline] = arg.split("=", 2);
    const name = raw.slice(2);
    if (spec.withValue.includes(name)) {
      // Accept both `--flag value` and `--flag=value`.
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`--${name} needs a value`);
      values.set(name, value);
    } else if (spec.boolean.includes(name)) {
      if (inline !== undefined)
        throw new Error(`--${name} does not take a value`);
      bools.add(name);
    } else {
      throw new Error(`unknown flag: ${raw}`);
    }
  }
  return {
    value: (name) => values.get(name) ?? null,
    bool: (name) => bools.has(name),
  };
}
