import { redirect } from "next/navigation";
import { platformPath } from "@/lib/routing/routes";

export default function LoginPage() {
  redirect(platformPath("/login"));
}
