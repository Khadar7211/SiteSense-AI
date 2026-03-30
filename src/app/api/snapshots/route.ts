import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ snapshots: [] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("progress_snapshots")
    .select("id, created_at, snapshot_period, overall_completion_pct, cumulative_achieved_weightage, label")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Could not load saved progress.", snapshots: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ snapshots: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const snapshot_period = body.snapshot_period === "weekly" ? "weekly" : "daily";
  const overall_completion_pct = Number(body.overall_completion_pct);
  const cumulative_achieved_weightage =
    body.cumulative_achieved_weightage != null
      ? Number(body.cumulative_achieved_weightage)
      : overall_completion_pct;
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : null;
  const task_count =
    typeof body.task_count === "number" ? body.task_count : null;

  if (!Number.isFinite(overall_completion_pct)) {
    return NextResponse.json(
      { error: "overall_completion_pct required" },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Saving snapshots is not available." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("progress_snapshots")
    .insert({
      snapshot_period,
      overall_completion_pct,
      cumulative_achieved_weightage,
      label,
      task_count,
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not save snapshot." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, snapshot: data });
}
