import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type ItemIn = { product_id: number; quantidade: number };

function onlyDigits(s: any) {
  return String(s ?? "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { cep, rua, numero, complemento, cidade, dia_semana, items } = body || {};

    if (
      !cep ||
      !rua ||
      !numero ||
      !cidade ||
      !dia_semana ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    // ✅ cria o admin AQUI dentro (não quebra build)
    const supabaseAdmin = getSupabaseAdmin();

    // MVP: exige Authorization Bearer <access_token>
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return NextResponse.json(
        { error: "Não autenticado (faltou Authorization Bearer token)." },
        { status: 401 }
      );
    }

    // Client “do usuário” só para validar token e pegar user_id
    const supaUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userErr } = await supaUser.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }
    const user_id = userData.user.id;

    // normaliza items
    const normItems: ItemIn[] = (items as any[]).map((i) => ({
      product_id: Number(i.product_id),
      quantidade: Number(i.quantidade),
    }));

    const productIdsUnique = Array.from(new Set(normItems.map((i) => i.product_id)));

    // valida itens
    for (const it of normItems) {
      if (!Number.isFinite(it.product_id) || it.product_id <= 0) {
        return NextResponse.json({ error: "Item inválido (product_id)." }, { status: 400 });
      }
      if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) {
        return NextResponse.json({ error: "Item inválido (quantidade)." }, { status: 400 });
      }
    }

    // 1) Produtos e preços
    const { data: prods, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id,nome,preco,ativo")
      .in("id", productIdsUnique);

    if (prodErr || !prods || prods.length !== productIdsUnique.length) {
      return NextResponse.json({ error: "Produtos inválidos." }, { status: 400 });
    }
    if (prods.some((p: any) => !p.ativo)) {
      return NextResponse.json({ error: "Há produto inativo no carrinho." }, { status: 400 });
    }

    // 2) Frete
    const { data: settingFrete } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "frete_valor")
      .maybeSingle();

    const frete = Number(settingFrete?.value ?? "7.00");

    // 3) Capacidade do dia
    const { data: caps, error: capErr } = await supabaseAdmin
      .from("daily_capacity")
      .select("product_id,limite_total")
      .eq("dia_semana", Number(dia_semana))
      .in("product_id", productIdsUnique);

    if (capErr) {
      return NextResponse.json({ error: "Erro ao consultar capacidade." }, { status: 500 });
    }

    const capByProduct = new Map<number, number>();
    for (const c of caps || []) {
      capByProduct.set(Number(c.product_id), Number(c.limite_total));
    }

    for (const pid of productIdsUnique) {
      if (!capByProduct.has(pid)) {
        return NextResponse.json(
          { error: `Capacidade não configurada para produto ${pid} nesse dia.` },
          { status: 400 }
        );
      }
    }

    // vendidos (status PAGO) no mesmo dia_semana
    const { data: soldRows, error: soldErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("status", "PAGO")
      .eq("dia_semana", Number(dia_semana));

    if (soldErr) {
      return NextResponse.json({ error: "Erro ao consultar pedidos pagos." }, { status: 500 });
    }

    const soldByProduct: Record<number, number> = {};
    if (soldRows && soldRows.length > 0) {
      const orderIds = soldRows.map((o: any) => o.id);

      const { data: soldItems, error: soldItemsErr } = await supabaseAdmin
        .from("order_items")
        .select("product_id,quantidade")
        .in("order_id", orderIds);

      if (soldItemsErr) {
        return NextResponse.json({ error: "Erro ao consultar itens vendidos." }, { status: 500 });
      }

      for (const it of soldItems || []) {
        const pid = Number(it.product_id);
        soldByProduct[pid] = (soldByProduct[pid] || 0) + Number(it.quantidade);
      }
    }

    // valida capacidade
    for (const it of normItems) {
      const limite = capByProduct.get(it.product_id)!;
      const ja = soldByProduct[it.product_id] || 0;

      if (ja + it.quantidade > limite) {
        return NextResponse.json(
          {
            error: `Limite excedido para produto ${it.product_id} nesse dia. Restante: ${Math.max(
              0,
              limite - ja
            )}`,
          },
          { status: 409 }
        );
      }
    }

    // 4) subtotal/total
    const priceById = new Map<number, number>(
      prods.map((p: any) => [Number(p.id), Number(p.preco)])
    );

    const subtotal = normItems.reduce((acc, it) => {
      const price = priceById.get(it.product_id) ?? 0;
      return acc + price * it.quantidade;
    }, 0);

    const total = subtotal + frete;

    // 5) cria order + itens
    const payloadOrder = {
      user_id,
      cidade: String(cidade).trim(),
      dia_semana: Number(dia_semana),
      cep: onlyDigits(cep),
      rua: String(rua).trim(),
      numero: String(numero).trim(),
      complemento: String(complemento ?? "").trim(),
      subtotal,
      frete,
      total,
      status: "PENDENTE",
    };

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert(payloadOrder)
      .select("id")
      .single();

    if (orderErr || !order?.id) {
      return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });
    }

    const orderItems = normItems.map((it) => {
      const preco_unit = priceById.get(it.product_id) ?? 0;
      return {
        order_id: order.id,
        product_id: it.product_id,
        quantidade: it.quantidade,
        preco_unit,
        subtotal: preco_unit * it.quantidade,
      };
    });

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsErr) {
      return NextResponse.json({ error: "Erro ao salvar itens." }, { status: 500 });
    }

    return NextResponse.json({ order_id: order.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
