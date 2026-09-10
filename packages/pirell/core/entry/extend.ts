import type { Op } from "../types/base.js";
import type { OpMap } from "./assemble.js";
import { valueOf } from "./surface.js";

export function extend<Ops extends OpMap>(surface: any, ops: Ops): any;
export function extend<Ops extends OpMap>(ops: Ops): (surface: any) => any;
// Args constrained to []: this form zero-calls fn to reach its stage —
// a parameterized op would silently run with its argument missing, so
// reject it at the type level instead.
export function extend(fn: Op<any, any, []>): (x: any) => any;
export function extend(surfaceOrOps: any, ops?: any): any {
  if (ops !== undefined) {
    return applyExtend(surfaceOrOps, ops);
  }
  if (typeof surfaceOrOps === "function") {
    // Unwrap surfaces to raw value first (both typeof checks matter:
    // surfaces are callable fns); zero-call fn to reach its stage.
    if (surfaceOrOps.length !== 0) {
      throw new TypeError(
        `extend(fn): fn expects ${surfaceOrOps.length} argument(s) — parameterized ops aren't supported by this form (their argument would be silently missing). Wire it via extend(surface, { name: fn }) instead, or pre-apply the argument: extend(fn(arg)).`,
      );
    }
    return (surfaceOrValue: any) => {
      const raw = valueOf(surfaceOrValue);
      return surfaceOrOps()(raw);
    };
  }
  return (surface: any) => applyExtend(surface, surfaceOrOps);
}

function applyExtend(surface: any, ops: OpMap): any {
  if (typeof surface.extend !== "function") {
    throw new TypeError(
      "extend(surface, ops): surface has no .extend() method — pass an assembled pirell() surface.",
    );
  }
  return surface.extend(ops);
}
