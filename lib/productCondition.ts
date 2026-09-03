export const PRODUCT_CONDITIONS = ["New", "Used", "Refurbished"] as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const DEFAULT_PRODUCT_CONDITION: ProductCondition = "New";

export function normalizeProductCondition(
  value: unknown
): ProductCondition | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "new") return "New";
  if (trimmed.toLowerCase() === "used") return "Used";
  if (trimmed.toLowerCase() === "refurbished") return "Refurbished";
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
      error: 'Product condition must be "New", "Used", or "Refurbished".',
    };
  }
  return { valid: true, condition: normalized };
}

/** Suggest a SKU suffix based on condition (e.g. -NEW, -USED, -REF). */
export function suggestSkuConditionSuffix(
  condition: ProductCondition
): string {
  if (condition === "New") return "-NEW";
  if (condition === "Used") return "-USED";
  if (condition === "Refurbished") return "-REF";
  return "-NEW";
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
  if (condition === "New")
    return "bg-sky-500/10 text-sky-300 border border-sky-500/20";
  if (condition === "Used")
    return "bg-orange-500/10 text-orange-300 border border-orange-500/20";
  if (condition === "Refurbished")
    return "bg-purple-500/10 text-purple-300 border border-purple-500/20";
  return "bg-slate-500/10 text-slate-300 border border-slate-500/20";
}

/** Append condition to product name if not already present. */
export function buildCounterpartProductName(
  name: string,
  targetCondition: ProductCondition
): string {
  const base = name
    .replace(/\s*-\s*(New|Used|Refurbished)\s*$/i, "")
    .replace(/\s*\((New|Used|Refurbished)\)\s*$/i, "")
    .trim();
  return `${base} - ${targetCondition}`;
}
