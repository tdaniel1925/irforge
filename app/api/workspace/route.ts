import { NextResponse } from "next/server";
import { listNotes, upsertNote, deleteNote } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ notes: await listNotes() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; title?: string; body?: string; pinned?: boolean };
  const note = await upsertNote(body);
  if (!note) return NextResponse.json({ error: "Couldn't save." }, { status: 400 });
  return NextResponse.json({ note });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await deleteNote(id);
  return NextResponse.json({ ok: true });
}
