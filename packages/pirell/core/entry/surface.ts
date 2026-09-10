// Single definition of surface identity + unwrap. assemble.ts and
// extend.ts must agree here, or user-facing and internal handling of
// extend(fn)(pirell(data)) diverge.
export const SURFACE = "__pirell";

export const isSurface = (x: unknown): boolean =>
  x != null &&
  (typeof x === "function" || typeof x === "object") &&
  SURFACE in (x as any);

export const valueOf = (x: unknown): unknown =>
  isSurface(x) ? (x as any).value : x;
