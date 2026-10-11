import { redirect } from "next/navigation";

export default async function WarehouseQueueRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  query.set("mode", "QUEUE");
  if (resolvedParams) {
    for (const [key, val] of Object.entries(resolvedParams)) {
      if (key !== "mode" && typeof val === "string") {
        query.set(key, val);
      }
    }
  }
  redirect(`/sales?${query.toString()}`);
}
