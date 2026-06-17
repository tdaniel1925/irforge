import { redirect } from "next/navigation";

// /metrics duplicated /proof ("Results"). Consolidated to one canonical page to
// avoid two confusingly-similar routes — redirect so any old links still resolve.
export default function MetricsRedirect() {
  redirect("/proof");
}
