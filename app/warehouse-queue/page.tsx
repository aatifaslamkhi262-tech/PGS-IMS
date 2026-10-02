import { redirect } from "next/navigation";

export default function WarehouseQueueRedirectPage() {
  redirect("/sales?mode=QUEUE");
}
