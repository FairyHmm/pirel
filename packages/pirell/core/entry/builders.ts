import { composeRaw } from "./compose.js";
import { SURFACE, isSurface, valueOf } from "./surface.js";
import type { Bound, Deferred, Op } from "../types/base.js";
import type { Assembled, OpMap } from "./assemble.js";

// Runtime surface builders (companion to assemble.ts, which owns the
// surface types). One shared assembly sequence; the two surface kinds
// differ only in what each step means (eager vs lazy).

// Ops are uniformly curried: apply args now, data when it arrives.
const runOp = (op: Op<any, any, any>, args: any[], data: unknown): unknown =>
  (op as unknown as (...a: any[]) => (data: unknown) => unknown)(...args)(data);

type SurfaceSpec = {
  invoke: (input: unknown) => unknown;
  getValue: () => unknown;
  applyOp: (op: Op<any, any, any>, args: any[]) => unknown;
  spawn: (ops: OpMap) => unknown;
  onPipe: (fns: Array<(x: any) => any>) => unknown;
  composable: boolean;
};

// One property map + single defineProperties: markers non-enumerable,
// methods enumerable+writable. Op methods forward args untouched —
// checking lives in Op signatures and chain typing, not here.
function buildSurface(ops: OpMap, spec: SurfaceSpec): any {
  const target: any = spec.invoke;
  const onPipe = (...fns: Array<(x: any) => any>) => spec.onPipe(fns);
  const assigned = {
    enumerable: true,
    writable: true,
    configurable: true,
  } as const;
  const props: PropertyDescriptorMap = {
    [SURFACE]: { value: true },
    value: { get: spec.getValue },
    extend: {
      ...assigned,
      value: (added: OpMap) => spec.spawn({ ...ops, ...added }),
    },
    pipe: { ...assigned, value: onPipe },
  };
  for (const name of Object.keys(ops)) {
    const opFn = ops[name]!;
    props[name] = {
      ...assigned,
      value: (...args: any[]) => spec.applyOp(opFn, args),
    };
  }
  // compose() only where composition can stay lazy; a bound surface has
  // nothing deferred to compose into (see Assembled<S> in assemble.ts).
  if (spec.composable) props.compose = { ...assigned, value: onPipe };
  Object.defineProperties(target, props);
  return target;
}

export function buildBound(value: unknown, ops: OpMap): Assembled<Bound<any>> {
  return buildSurface(ops, {
    // Re-enter: reuse another surface's value, or bind raw data as-is.
    invoke: (input) => buildBound(valueOf(input), ops),
    getValue: () => value,
    applyOp: (op, args) => buildBound(runOp(op, args, value), ops),
    spawn: (nextOps) => buildBound(value, nextOps),
    onPipe: (fns) => composeRaw(...fns)(value),
    composable: false,
  });
}

export function buildDeferred(
  steps: Array<(data: unknown) => unknown>,
  ops: OpMap,
): Assembled<Deferred<any>> {
  // pipe and compose are the same append: staying lazy already is
  // compose's "don't apply yet" contract.
  const append = (fns: Array<(x: any) => any>) =>
    buildDeferred([...steps, composeRaw(...fns)], ops);
  return buildSurface(ops, {
    invoke: (input) =>
      buildBound(
        isSurface(input)
          ? valueOf(input)
          : steps.reduce((acc, step) => step(acc), input),
        ops,
      ),
    getValue: () => undefined,
    applyOp: (op, args) =>
      buildDeferred([...steps, (data) => runOp(op, args, data)], ops),
    spawn: (nextOps) => buildDeferred(steps, nextOps),
    onPipe: append,
    composable: true,
  });
}
