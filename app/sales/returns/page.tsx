import { redirect } from "next/navigation";

export default function SalesReturnsRedirectPage() {
  redirect("/sales?mode=RETURNS");
}
