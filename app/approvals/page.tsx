// Approvals now lives in the unified Posts page; this route stays as a thin wrapper
// for back-compat and renders the inbox component.
import ApprovalsInbox from "@/components/ApprovalsInbox";

export default function ApprovalsPage() {
  return <ApprovalsInbox />;
}
