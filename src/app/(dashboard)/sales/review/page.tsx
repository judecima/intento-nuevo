import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/routing/server";

export default function SalesReviewPage() {
  redirect(scopedPath("/sales/orders"));
}
