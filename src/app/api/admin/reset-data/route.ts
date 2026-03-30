import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

async function deleteAllByKnownColumn(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  table: string,
  column: string
) {
  const { error } = await supabase.from(table).delete().not(column, "is", null);
  if (!error) return null;
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("does not exist") || msg.includes("could not find")) return null;
  return error.message;
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const issues: string[] = [];

  const steps: Array<{ table: string; column: string }> = [
    { table: "progress_logs", column: "id" },
    { table: "project_latest_state", column: "project_id" },
    { table: "task_settings", column: "task_id" },
    { table: "progress_snapshots", column: "id" },
    { table: "projects", column: "id" },
  ];

  for (const step of steps) {
    const err = await deleteAllByKnownColumn(supabase, step.table, step.column);
    if (err) issues.push(`${step.table}: ${err}`);
  }

  if (issues.length) {
    return NextResponse.json(
      { error: "Reset completed with issues", issues },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
