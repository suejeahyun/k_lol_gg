export const PUBLIC_REALTIME_CACHE_HEADER = "public, s-maxage=15, stale-while-revalidate=30";
export const PUBLIC_SHORT_CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";
export const PUBLIC_MEDIUM_CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=900";
export const PRIVATE_NO_STORE_HEADER = "private, no-store, max-age=0";
