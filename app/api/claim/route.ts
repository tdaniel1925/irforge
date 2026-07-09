import { NextResponse } from "next/server";
import { rateAllow } from "@/lib/publicStats";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FILE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 5;
const OK_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"]);

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon").trim();
}

// POST (multipart/form-data) — a company representative claims a ticker's page and
// submits verification proof (an authorization/registration document + a government
// ID of the named person). Creates a pending claim_requests row and uploads the docs
// to the private claim-docs bucket. No login required — this is the entry point for a
// company that hasn't signed up yet; an admin reviews and verifies.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateAllow(`claim:${ip}`, 4))) {
    return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const ticker = String(form.get("ticker") ?? "").toUpperCase().slice(0, 8);
  const companyName = String(form.get("companyName") ?? "").trim().slice(0, 120);
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const title = String(form.get("title") ?? "").trim().slice(0, 80);
  const relationship = String(form.get("relationship") ?? "").trim().slice(0, 40);
  const email = String(form.get("email") ?? "").trim().slice(0, 120);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 40);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 1000);

  if (!/^[A-Z][A-Z0-9.\-]{0,7}$/.test(ticker)) {
    return NextResponse.json({ error: "Enter a valid ticker." }, { status: 422 });
  }
  if (!name || !companyName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Company, your name, and a valid work email are required." }, { status: 422 });
  }
  if (!relationship) {
    return NextResponse.json({ error: "Tell us your relationship to the company." }, { status: 422 });
  }

  const files = form.getAll("docs").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Upload at least one proof document (authorization letter or filing) and a government ID." }, { status: 422 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files — up to ${MAX_FILES}.` }, { status: 422 });
  }
  for (const f of files) {
    if (f.size > MAX_FILE) return NextResponse.json({ error: `"${f.name}" is over 10MB.` }, { status: 422 });
    if (!OK_TYPES.has(f.type)) return NextResponse.json({ error: `"${f.name}" must be a PDF or image.` }, { status: 422 });
  }

  const svc = createServiceClient();

  // Upload each proof doc to the private bucket under this ticker + a random-ish key.
  const docPaths: string[] = [];
  let idx = 0;
  for (const f of files) {
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
    const path = `${ticker}/${email.replace(/[^a-z0-9]/gi, "_")}/${idx}-${safeName}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error } = await svc.storage.from("claim-docs").upload(path, buf, {
      contentType: f.type,
      upsert: true,
    });
    if (error) {
      return NextResponse.json({ error: "Couldn't store your documents — please try again." }, { status: 502 });
    }
    docPaths.push(path);
    idx++;
  }

  const { error: insErr } = await svc.from("claim_requests").insert({
    ticker,
    company_name: companyName,
    name,
    title,
    relationship,
    role: title || relationship,
    email,
    phone,
    notes,
    doc_paths: docPaths,
    status: "pending",
  });
  if (insErr) {
    return NextResponse.json({ error: "Couldn't submit your claim — please try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
