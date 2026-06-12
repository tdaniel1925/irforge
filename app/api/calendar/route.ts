import { NextResponse } from "next/server";
import { getDb, logAudit, newId, saveDb } from "@/lib/db";
import type { CalendarEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST — add a calendar event. If it's earnings, auto-create a quiet-period start 14 days prior.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const date = String(b.date ?? "").slice(0, 10);
  const title = String(b.title ?? "").trim().slice(0, 120);
  const type = ["earnings", "filing_deadline", "conference", "lockup", "custom"].includes(b.type) ? b.type : "custom";
  if (!date || !title) return NextResponse.json({ error: "Date and title required." }, { status: 422 });

  const db = getDb();
  const event: CalendarEvent = { id: newId("cal"), date, title, type, note: b.note ? String(b.note).slice(0, 200) : undefined };
  db.calendar.push(event);

  // Earnings auto-schedules a quiet-period start 14 days before.
  if (type === "earnings") {
    const quietDate = new Date(new Date(date).getTime() - 14 * 86400000).toISOString().slice(0, 10);
    db.calendar.push({ id: newId("cal"), date: quietDate, title: "Quiet period begins", type: "quiet_start", note: "Publishing auto-locks 14 days before earnings." });
  }

  db.calendar.sort((a, b) => a.date.localeCompare(b.date));
  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "CALENDAR_ADDED", `${title} on ${date}`);
  saveDb(db);
  return NextResponse.json({ ok: true, calendar: db.calendar });
}

// DELETE — remove an event.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const db = getDb();
  db.calendar = db.calendar.filter((e) => e.id !== id);
  saveDb(db);
  return NextResponse.json({ ok: true, calendar: db.calendar });
}
