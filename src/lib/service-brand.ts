export type ServiceId = "klol" | "nexus" | "hub" | "community";
export type ServiceBrand = Readonly<{
  id: ServiceId;
  communityId?: string;
  name: string;
  shortName: string;
  initials: string;
  storagePrefix: string;
  defaultOrigin: string;
}>;
export type CommunityBrandConfiguration = Readonly<{
  id?: string;
  name?: string;
  shortName?: string;
  initials?: string;
}>;

export function requireManagedCommunityId(value: string | undefined): string {
  if (!value || !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u.test(value)
    || ["klol", "nexus", "hub"].includes(value)) {
    throw new Error("NEXT_PUBLIC_COMMUNITY_ID must be a unique lowercase community identifier (1-48 letters, digits or hyphens).");
  }
  return value;
}

export function getServiceId(serviceId: string | undefined): ServiceId {
  const id = serviceId?.trim() || "klol";
  if (id !== "klol" && id !== "nexus" && id !== "hub" && id !== "community") {
    throw new Error("NEXT_PUBLIC_SERVICE_ID must be klol, nexus, or hub, or community.");
  }
  return id;
}

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
  hub: Object.freeze({
    id: "hub" as const,
    name: "GG HUB",
    shortName: "GG HUB",
    initials: "GG",
    storagePrefix: "gg-hub",
    defaultOrigin: "http://localhost:3000",
  }),
});

export function getServiceBrand(
  serviceId: string | undefined = process.env.NEXT_PUBLIC_SERVICE_ID,
  community: CommunityBrandConfiguration = {
    id: process.env.NEXT_PUBLIC_COMMUNITY_ID,
    name: process.env.NEXT_PUBLIC_COMMUNITY_NAME,
    shortName: process.env.NEXT_PUBLIC_COMMUNITY_SHORT_NAME,
    initials: process.env.NEXT_PUBLIC_COMMUNITY_INITIALS,
  },
): ServiceBrand {
  const id = getServiceId(serviceId);
  if (id === "community") {
    const communityId = requireManagedCommunityId(community.id);
    const name = community.name?.trim();
    const shortName = community.shortName?.trim() || name;
    const initials = community.initials?.trim() || Array.from(shortName ?? "").slice(0, 2).join("");
    if (!name || name.length > 80 || !shortName || shortName.length > 40 || !initials || initials.length > 8
      || /[\u0000-\u001f\u007f]/u.test(`${name}${shortName}${initials}`)) {
      throw new Error("Managed community name, short name and initials must be valid display text.");
    }
    return Object.freeze({ id, communityId, name, shortName, initials, storagePrefix: `gg-community-${communityId}`, defaultOrigin: "http://localhost:3000" });
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
