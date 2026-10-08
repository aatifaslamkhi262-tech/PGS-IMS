/**
 * lib/costing.ts
 *
 * Centralized Inventory Costing & Weighted Average Engine Helper.
 * Enforces standardized costing rules across the entire application:
 * 1. COST_PLACEHOLDER_MAX = 1 (costs <= 1 represent placeholder / unknown cost).
 * 2. Moving average cost is strictly quantity-weighted.
 * 3. Unknown / zero / placeholder stock (avg <= 1) does NOT dilute incoming valid stock cost.
 */

export const COST_PLACEHOLDER_MAX = 1;

/**
 * Returns true if a given cost is a valid real cost (greater than COST_PLACEHOLDER_MAX).
 */
export function isValidCost(cost: number | null | undefined): boolean {
  return typeof cost === "number" && !isNaN(cost) && cost > COST_PLACEHOLDER_MAX;
}

export interface BlendAverageCostInput {
  existingQty: number;
  existingAvg: number;
  incomingQty: number;
  incomingCost: number;
}

/**
 * Pure function to calculate quantity-weighted average cost upon stock intake or transfer receive.
 *
 * Rules:
 * - Throws if incomingCost <= COST_PLACEHOLDER_MAX (callers must validate incoming cost).
 * - If existingQty <= 0 OR existingAvg <= COST_PLACEHOLDER_MAX: returns incomingCost (prevents zero/placeholder dilution).
 * - Otherwise: computes rounded weighted average cost = Math.round(((existingQty * existingAvg + incomingQty * incomingCost) / (existingQty + incomingQty)) * 100) / 100.
 */
export function blendAverageCost(input: BlendAverageCostInput): number {
  const incomingQty = Math.max(1, Number(input.incomingQty || 1));
  const incomingCost = Number(input.incomingCost || 0);

  if (!isValidCost(incomingCost)) {
    throw new Error(`Invalid incoming cost: ${incomingCost}. Cost must be greater than ${COST_PLACEHOLDER_MAX}.`);
  }

  const existingQty = Math.max(0, Number(input.existingQty || 0));
  const existingAvg = Number(input.existingAvg || 0);

  // If pool has no stock or existing average is unknown / placeholder (<= 1),
  // do NOT dilute incoming stock! Accept incoming cost directly.
  if (existingQty <= 0 || !isValidCost(existingAvg)) {
    return incomingCost;
  }

  const totalQty = existingQty + incomingQty;
  const totalValue = existingQty * existingAvg + incomingQty * incomingCost;
  const newAvg = totalValue / totalQty;

  return Math.round(newAvg * 100) / 100;
}
