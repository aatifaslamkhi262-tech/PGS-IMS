export const PRODUCT_CONDITIONS = ["New", "Used"] as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const DEFAULT_PRODUCT_CONDITION: ProductCondition = "New";

export function normalizeProductCondition(
  value: unknown
): ProductCondition | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "new") return "New";
  if (trimmed.toLowerCase() === "used") return "Used";
  return null;
}

export function validateProductCondition(value: unknown): {
  valid: boolean;
  condition?: ProductCondition;
  error?: string;
} {
  const normalized = normalizeProductCondition(value);
  if (!normalized) {
    return {
      valid: false,
      error: 'Product condition must be either "New" or "Used".',
    };
  }
  return { valid: true, condition: normalized };
}

/** Suggest a SKU suffix based on condition (e.g. -NEW, -USED). */
export function suggestSkuConditionSuffix(
  condition: ProductCondition
): string {
  return condition === "New" ? "-NEW" : "-USED";
}

/** Build a draft SKU from product name initials and condition. */
export function buildSkuDraft(
  name: string,
  condition: ProductCondition = DEFAULT_PRODUCT_CONDITION
): string {
  const prefix = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .substring(0, 4);
  const rand = Math.floor(100 + Math.random() * 900);
  const suffix = suggestSkuConditionSuffix(condition);
  return `${prefix || "PROD"}${suffix}-${rand}`;
}

/** Tailwind classes for condition badges in the UI. */
export function getConditionBadgeClasses(
  condition: ProductCondition
): string {
  return condition === "New"
    ? "bg-sky-500/10 text-sky-300 border border-sky-500/20"
    : "bg-orange-500/10 text-orange-300 border border-orange-500/20";
}

/** Append condition to product name if not already present. */
export function buildCounterpartProductName(
  name: string,
  targetCondition: ProductCondition
): string {
  const base = name
    .replace(/\s*-\s*(New|Used)\s*$/i, "")
    .replace(/\s*\((New|Used)\)\s*$/i, "")
    .trim();
  return `${base} - ${targetCondition}`;
}
