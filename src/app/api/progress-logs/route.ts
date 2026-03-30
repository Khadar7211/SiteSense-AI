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
    return NextResponse.json({ logs: [] });
  }

  const { data, error } = await supabase
    .from("progress_logs")
    .select("id,recorded_at,total_completion_pct,leaf_count,source")
    .eq("project_id", projectId)
    .order("recorded_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const total = Number(body.total_completion_pct);
  const leafCount =
    body.leaf_count != null && body.leaf_count !== ""
      ? Number(body.leaf_count)
      : null;
  const source = typeof body.source === "string" ? body.source : "upload";

  if (!projectId || !Number.isFinite(total)) {
    return NextResponse.json(
      { error: "projectId and total_completion_pct required" },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("progress_logs")
    .insert({
      project_id: projectId,
      total_completion_pct: total,
      leaf_count: Number.isFinite(leafCount as number) ? leafCount : null,
      source,
    })
    .select("id,recorded_at,total_completion_pct,leaf_count")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log: data });
}
