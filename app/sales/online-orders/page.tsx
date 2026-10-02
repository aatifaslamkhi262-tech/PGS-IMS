import { redirect } from "next/navigation";

export default function OnlineOrdersRedirectPage() {
  redirect("/sales?mode=ONLINE");
}
