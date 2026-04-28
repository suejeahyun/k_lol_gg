import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SignupForm from "@/components/SignupForm";

export default async function SignupPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");

  if (token) {
    redirect("/");
  }

  return <SignupForm />;
}