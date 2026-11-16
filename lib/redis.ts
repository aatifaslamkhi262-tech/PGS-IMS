/**
 * Lightweight REST-based Upstash Redis Cache Invalidator
 * Uses native fetch with zero extra packages to purge storefront cache keys on product/stock mutations
 */

export async function invalidateStorefrontCache(
  keys: string[] = ["pgs:catalog:v1", "pgs:categories:v1"]
): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || !Array.isArray(keys) || keys.length === 0) {
    return;
  }

  try {
    const pipeline = keys.map((key) => ["DEL", key]);
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.error("[Redis] Failed to invalidate cache keys:", keys, err);
  }
}
