export const MAX_TOOL_ITERATIONS_PER_TURN = 25;
export const MAX_CONSECUTIVE_REDUNDANT_CALLS = 3;

export interface ToolCallTracker {
  stepCount: number;
  lastCallSignature: string | null;
  consecutiveSameCallCount: number;
}

export function createToolCallTracker(): ToolCallTracker {
  return {
    stepCount: 0,
    lastCallSignature: null,
    consecutiveSameCallCount: 0,
  };
}

function canonicalizeValue(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = canonicalizeValue((val as Record<string, unknown>)[key]);
  }
  return sortedObj;
}

export function computeToolCallSignature(name: string, args: unknown): string {
  if (args === null || args === undefined) {
    return `${name}:`;
  }
  if (typeof args !== "object") {
    return `${name}:${String(args)}`;
  }
  try {
    return `${name}:${JSON.stringify(canonicalizeValue(args))}`;
  } catch {
    return `${name}:unknown`;
  }
}

export function evaluateToolCallGuard(
  tracker: ToolCallTracker,
  name: string,
  args: unknown,
): { allow: true } | { allow: false; reason: string; terminate: boolean } {
  tracker.stepCount += 1;

  // 1. Circuit Breaker Check
  if (tracker.stepCount > MAX_TOOL_ITERATIONS_PER_TURN) {
    return {
      allow: false,
      reason: `Circuit breaker triggered: Exceeded maximum of ${MAX_TOOL_ITERATIONS_PER_TURN} tool execution steps in a single turn. Synthesizing final response with current findings.`,
      terminate: true,
    };
  }

  // 2. Redundancy Detector Check
  const sig = computeToolCallSignature(name, args);
  if (tracker.lastCallSignature === sig) {
    tracker.consecutiveSameCallCount += 1;
  } else {
    tracker.lastCallSignature = sig;
    tracker.consecutiveSameCallCount = 1;
  }

  if (tracker.consecutiveSameCallCount >= MAX_CONSECUTIVE_REDUNDANT_CALLS) {
    return {
      allow: false,
      reason: `Loop detected: Tool '${name}' called ${tracker.consecutiveSameCallCount} consecutive times with identical arguments. Stopping redundant execution to prevent token waste.`,
      terminate: true,
    };
  }

  return { allow: true };
}
