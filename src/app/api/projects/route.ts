import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeProjectName(name: string): string {
  let s = name.trim();
  s = s.replace(/[_-]+/g, " ");
  s = s.replace(/\(\s*\d+\s*\)/g, "");
  s = s.replace(/\bextract\b/gi, "");
  s = s.replace(/\bexport\b/gi, "");
  s = s.replace(/\bcopy\b/gi, "");
  s = s.replace(/\bv(?:er(?:sion)?)?\s*\d+\b/gi, "");
  s = s.replace(/\b\d+\b$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s || "Untitled project";
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ projects: [], project: null });
  }

  const { searchParams } = new URL(req.url);
  const rawName = searchParams.get("name");
  const name = rawName ? normalizeProjectName(rawName) : null;
  if (name) {
    const { data, error } = await supabase
      .from("projects")
      .select("id,name,created_at")
      .eq("name", name)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ project: data });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id,name,created_at")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? normalizeProjectName(body.name) : "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ name })
    .select("id,name,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Project already exists", code: "duplicate" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}
