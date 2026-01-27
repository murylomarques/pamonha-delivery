// src/app/api/admin/orders/route.ts
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

  return { ok: true as const, token, user_id: userData.user.id };
}

export async function GET(req: Request) {
  try {
    const check = await requireAdmin(req);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

    const url = new URL(req.url);

    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const pay = (url.searchParams.get("pay") || "ALL").toUpperCase(); // PAGO|PENDENTE|CANCELADO|ALL
    const del = (url.searchParams.get("del") || "ALL").toUpperCase(); // NOVO|EM_ROTA|ENTREGUE|CANCELADO|ALL (ajuste aos seus enums)
    const cidade = (url.searchParams.get("cidade") || "").trim();
    const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || 100)));

    const admin = supabaseAdmin();

    let query = admin
      .from("orders")
      .select(
        `
        id,user_id,cidade,dia_semana,cep,rua,numero,complemento,
        subtotal,frete,total,status,mp_preference_id,mp_payment_id,created_at,
        delivery_status,delivery_notes,delivered_at,
        order_items(
          id,product_id,quantidade,preco_unit,subtotal,
          products(nome,image_url)
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (pay !== "ALL") query = query.eq("status", pay);
    if (del !== "ALL") query = query.eq("delivery_status", del);
    if (cidade) query = query.eq("cidade", cidade);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows: any[] = (data || []) as any[];

    // filtro local por termo (id/cidade/cep/user_id)
    if (q) {
      rows = rows.filter((o) => {
        const inId = String(o.id || "").toLowerCase().includes(q);
        const inCidade = String(o.cidade || "").toLowerCase().includes(q);
        const inCep = String(o.cep || "").toLowerCase().includes(q);
        const inUser = String(o.user_id || "").toLowerCase().includes(q);
        return inId || inCidade || inCep || inUser;
      });
    }

    return NextResponse.json({ orders: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
