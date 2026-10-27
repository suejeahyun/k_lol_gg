export type ServiceId = "klol" | "nexus";

const SERVICE_BRANDS = Object.freeze({
  klol: Object.freeze({
    id: "klol" as const,
    name: "K-LOL.GG",
    shortName: "K-LOL",
    initials: "K",
    storagePrefix: "klol",
    defaultOrigin: "https://k-lol-gg.vercel.app",
  }),
  nexus: Object.freeze({
    id: "nexus" as const,
    name: "NEXUS.GG",
    shortName: "NEXUS",
    initials: "N",
    storagePrefix: "nexus",
    // A new service must never fall back to the existing community's website.
    defaultOrigin: "http://localhost:3000",
  }),
});

export function getServiceBrand(serviceId: string | undefined = process.env.NEXT_PUBLIC_SERVICE_ID) {
  const id = serviceId?.trim() || "klol";
  if (id !== "klol" && id !== "nexus") {
    throw new Error("NEXT_PUBLIC_SERVICE_ID must be klol or nexus.");
  }
  return SERVICE_BRANDS[id];
}

// Keep the explicit NEXT_PUBLIC access so Next.js uses the same build-time brand
// in server-rendered HTML and client bundles.
export const SERVICE_BRAND = getServiceBrand(process.env.NEXT_PUBLIC_SERVICE_ID);

export function getServiceOrigin(configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL, brand = SERVICE_BRAND): URL {
  const origin = new URL(configuredOrigin?.trim() || brand.defaultOrigin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use http or https");
  }
  origin.username = "";
  origin.password = "";
  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";
  return origin;
}
