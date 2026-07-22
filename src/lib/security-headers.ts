import { NextResponse } from "next/server";
import {
  buildContentSecurityPolicy as buildPolicy,
  getSecurityHeaderEntries,
} from "@/lib/security-policy";

const isProduction = process.env.NODE_ENV === "production";

export function buildContentSecurityPolicy() {
  return buildPolicy(isProduction);
}

export function applySecurityHeaders(response: NextResponse) {
  for (const header of getSecurityHeaderEntries(isProduction)) {
    response.headers.set(header.key, header.value);
  }
  return response;
}
