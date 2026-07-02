import { NextResponse } from "next/server";
import { polishText } from "@/lib/ai";
import { getMyCompany } from "@/lib/supabase/store";

export const dynamic = "force-dynamic";

// POST { text } — return a cleaned-up version of the text (grammar, spelling, spacing,
// line breaks) WITHOUT changing meaning or adding claims. Used by the smart editor's
// "Polish" button across compose surfaces. Compliance-safe: it only tidies, it does
// not invent facts, numbers, or promotional language.
export async function POST(req: Request) {
  // Auth gate: spends AI tokens. (No getStore() here, so check the company directly.)
  if (process.env.AUTH_ENABLED === "1" && !(await getMyCompany())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const input = String(text ?? "").trim();
  if (!input) return NextResponse.json({ error: "Nothing to polish." }, { status: 422 });
  if (input.length > 8000) return NextResponse.json({ error: "Text is too long to polish (max 8000 chars)." }, { status: 422 });

  const polished = await polishText(input);
  if (!polished) return NextResponse.json({ error: "Couldn't polish right now — try again." }, { status: 502 });
  return NextResponse.json({ polished });
}
