import { redirect } from "next/navigation";

export default function AdvanceBookingRedirectPage() {
  redirect("/sales?mode=ADVANCE");
}
