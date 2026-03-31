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
    return NextResponse.json({ state: null });
  }

  const query = supabase
    .from("project_latest_state")
    .select("project_id, uploaded_at, source_filename, leaves_json, rows_json")
    .eq("project_id", projectId)
    .maybeSingle();

  let { data, error } = await query;
  if (error && (error.message || "").toLowerCase().includes("rows_json")) {
    // Backward compatibility where rows_json column is not yet migrated.
    ({ data, error } = await supabase
      .from("project_latest_state")
      .select("project_id, uploaded_at, source_filename, leaves_json")
      .eq("project_id", projectId)
      .maybeSingle());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ state: data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const sourceFilename =
    typeof body.sourceFilename === "string" ? body.sourceFilename : null;
  const leaves =
    Array.isArray(body.leaves) &&
    body.leaves.every((x: unknown) => typeof x === "object" && x !== null)
      ? body.leaves
      : null;
  const rows =
    Array.isArray(body.rows) &&
    body.rows.every((x: unknown) => typeof x === "object" && x !== null)
      ? body.rows
      : null;

  if (!projectId || !leaves) {
    return NextResponse.json(
      { error: "projectId and leaves are required" },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let { error } = await supabase.from("project_latest_state").upsert(
    {
      project_id: projectId,
      source_filename: sourceFilename,
      leaves_json: leaves,
      rows_json: rows,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "project_id" }
  );
  if (error && (error.message || "").toLowerCase().includes("rows_json")) {
    // Backward compatibility where rows_json column is not yet migrated.
    ({ error } = await supabase.from("project_latest_state").upsert(
      {
        project_id: projectId,
        source_filename: sourceFilename,
        leaves_json: leaves,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    ));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
