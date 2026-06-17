import { redirect } from "next/navigation";

// /mentions wasn't linked in the nav; its "what's being said + respond" job lives
// in Defense & Reach (/company). Redirect so old links resolve to the canonical page.
export default function MentionsRedirect() {
  redirect("/company");
}
