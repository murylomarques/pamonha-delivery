// src/app/api/admin/orders/[id]/delivery/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false as const, status: 401, error: "Sem token (Bearer)." };

  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supaUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: userData, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Sessão inválida." };

  const admin = supabaseAdmin();
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profErr || profile?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Sem permissão de admin." };
  }

  return { ok: true as const };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const delivery_status = String(body?.delivery_status || "").toUpperCase();
    const delivery_notes = String(body?.delivery_notes || "");
    const markDelivered = Boolean(body?.markDelivered);

    if (!delivery_status) {
      return NextResponse.json({ error: "delivery_status é obrigatório." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const payload: any = {
      delivery_status,
      delivery_notes,
    };

    if (markDelivered) payload.delivered_at = new Date().toISOString();

    const { data, error } = await admin
      .from("orders")
      .update(payload)
      .eq("id", id)
      .select("id,delivery_status,delivery_notes,delivered_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, order: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
