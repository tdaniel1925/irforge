import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { scanThreats } from "@/lib/threats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET — scan for threats against the company's ticker.
export async function GET() {
  const { db } = await getStore();
  const report = await scanThreats(db);
  return NextResponse.json(report);
}
