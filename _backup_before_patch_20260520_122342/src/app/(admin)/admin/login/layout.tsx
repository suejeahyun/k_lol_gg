import { ReactNode } from "react";

type AdminLoginLayoutProps = {
  children: ReactNode;
};

export default function AdminLoginLayout({
  children,
}: AdminLoginLayoutProps) {
  return <>{children}</>;
}