import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listMyCalendars, listCalendarEvents, addCalendarEvent, deleteCalendarEvent, createCalendar } from "@/lib/calendars";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  return { mine };
}

// GET — the caller's visible calendars + events (optionally for a date range).
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const calendars = await listMyCalendars();
  const events = await listCalendarEvents({ from, to });
  return NextResponse.json({ calendars, events });
}

// POST — { action: "event", calendarId, title, eventDate, eventTime?, type?, note? }
//      — { action: "calendar", kind, name, color?, personal? }
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const b = await req.json().catch(() => ({}));

  if (b.action === "calendar") {
    const cal = await createCalendar({ kind: b.kind, name: String(b.name ?? ""), color: b.color, personal: Boolean(b.personal) });
    if (!cal) return NextResponse.json({ error: "Couldn't create the calendar." }, { status: 422 });
    return NextResponse.json({ ok: true, calendar: cal });
  }

  // default: add an event
  if (!b.calendarId || !b.title || !b.eventDate) return NextResponse.json({ error: "Missing calendar, title, or date." }, { status: 422 });
  const ev = await addCalendarEvent({
    calendarId: String(b.calendarId),
    title: String(b.title),
    eventDate: String(b.eventDate),
    eventTime: typeof b.eventTime === "string" ? b.eventTime : undefined,
    type: typeof b.type === "string" ? b.type : undefined,
    note: typeof b.note === "string" ? b.note : undefined,
  });
  if (!ev) return NextResponse.json({ error: "Couldn't add the event." }, { status: 422 });
  return NextResponse.json({ ok: true, event: ev });
}

// DELETE ?id=… — remove an event.
export async function DELETE(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 422 });
  await deleteCalendarEvent(id);
  return NextResponse.json({ ok: true });
}
