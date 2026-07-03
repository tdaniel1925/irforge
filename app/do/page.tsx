import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The old standalone "Do queue" is superseded by the unified Posts page — its
// "Needs approval" tab embeds the same approval inbox (ApprovalsInbox, same db.drafts
// flow). Not in the nav. Kept as a redirect so old links/bookmarks land in the right
// place; no data change.
export default function DoRedirect() {
  redirect("/posts");
}
