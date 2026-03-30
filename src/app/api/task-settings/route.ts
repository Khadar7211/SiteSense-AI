import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ weights: {} as Record<string, number> });
  }

  const { data, error } = await supabase
    .from("task_settings")
    .select("task_id, target_weight_pct")
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json(
      { error: "Could not load saved weights.", weights: {} },
      { status: 500 }
    );
  }

  const weights: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.task_id != null && row.target_weight_pct != null) {
      weights[row.task_id] = Number(row.target_weight_pct);
    }
  }

  return NextResponse.json({ weights });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const raw = body.weights as Record<string, number> | undefined;

  if (!projectId || !raw || typeof raw !== "object") {
    return NextResponse.json(
      { error: "projectId and weights object required" },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Saving weights is not available." },
      { status: 503 }
    );
  }

  const rows = Object.entries(raw).map(([task_id, target_weight_pct]) => ({
    project_id: projectId,
    task_id,
    target_weight_pct: Number(target_weight_pct),
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("task_settings").upsert(rows, {
    onConflict: "project_id,task_id",
  });

  if (error) {
    return NextResponse.json({ error: "Could not save weights." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
