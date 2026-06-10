"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccountSwitchUser = {
  role?: "USER" | "ADMIN" | "SUPER_ADMIN" | string;
  status?: "PENDING" | "APPROVED" | "REJECTED" | string;
} | null;

function isAdmin(user: AccountSwitchUser) {
  return Boolean(
    user &&
      user.status === "APPROVED" &&
      (user.role === "ADMIN" || user.role === "SUPER_ADMIN")
  );
}

export default function AppTopAccountSwitch({
  mode,
  user: providedUser,
  checked: providedChecked,
}: {
  mode: "user" | "admin";
  user?: AccountSwitchUser;
  checked?: boolean;
}) {
  const [user, setUser] = useState<AccountSwitchUser>(providedUser ?? null);
  const [checked, setChecked] = useState(Boolean(providedChecked));

  useEffect(() => {
    if (providedChecked !== undefined) {
      setUser(providedUser ?? null);
      setChecked(providedChecked);
      return;
    }

    let mounted = true;

    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (mounted) setUser(null);
          return;
        }
        const data: { user?: AccountSwitchUser } = await res.json();
        if (mounted) setUser(data.user ?? null);
      } catch (error: unknown) {
        console.error("[APP_TOP_ACCOUNT_SWITCH_ERROR]", error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setChecked(true);
      }
    }

    fetchUser().catch((error: unknown) => {
      console.error("[APP_TOP_ACCOUNT_SWITCH_PROMISE_ERROR]", error);
      if (mounted) {
        setUser(null);
        setChecked(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, [providedChecked, providedUser]);

  if (mode === "admin") {
    return (
      <Link href="/app" className="app-topbar__switch-link app-topbar__switch-link--user">
        유저 HOME
      </Link>
    );
  }

  if (!checked || !isAdmin(user)) return null;

  return (
    <Link href="/app/admin" className="app-topbar__switch-link app-topbar__switch-link--admin">
      관리자 HOME
    </Link>
  );
}
