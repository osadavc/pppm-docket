import { redirect } from "next/navigation";

/** Preserve old bookmarks while all product navigation uses /queue. */
export default function AgendaRedirect() {
  redirect("/queue");
}
