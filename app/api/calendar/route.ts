import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST — add a calendar event. If it's earnings, auto-create a quiet-period start 14 days prior.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const date = String(b.date ?? "").slice(0, 10);
  const title = String(b.title ?? "").trim().slice(0, 120);
  const ALLOWED = ["earnings", "filing_deadline", "conference", "lockup", "holiday", "presentation", "follow_up_call", "onboarding_session", "team_meeting", "reminder", "custom"];
  const type = ALLOWED.includes(b.type) ? b.type : "custom";
  if (!date || !title) return NextResponse.json({ error: "Date and title required." }, { status: 422 });

  const { db, save } = await getStore();
  const event: CalendarEvent = { id: newId("cal"), date, title, type, note: b.note ? String(b.note).slice(0, 200) : undefined };
  db.calendar.push(event);
  // Note: no auto-scheduled quiet period — quiet periods are set explicitly by the
  // company (the old "auto-lock 14 days before earnings" behavior was removed).

  db.calendar.sort((a, b) => a.date.localeCompare(b.date));
  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "CALENDAR_ADDED", `${title} on ${date}`);
  await save();
  return NextResponse.json({ ok: true, calendar: db.calendar });
}

// DELETE — remove an event.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const { db, save } = await getStore();
  const target = db.calendar.find((e) => e.id === id);
  if (!target) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  db.calendar = db.calendar.filter((e) => e.id !== target.id);
  await save();
  return NextResponse.json({ ok: true, calendar: db.calendar });
}
