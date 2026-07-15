import type { CapacitorConfig } from "@capacitor/cli";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveServerUrl() {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
  if (explicit) return explicit;

  const publicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (publicBaseUrl) return `${trimTrailingSlash(publicBaseUrl)}/app`;

  return "https://k-lol-gg.vercel.app/app";
}

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID?.trim() || "gg.klol.app",
  appName: process.env.CAPACITOR_APP_NAME?.trim() || "K-LOL.GG",
  webDir: "capacitor-web",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
  android: {
    backgroundColor: "#05070d",
    allowMixedContent: false,
  },
};

export default config;
