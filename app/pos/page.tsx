import { redirect } from "next/navigation";

export default function POSRedirectPage() {
  redirect("/sales?mode=POS");
}

