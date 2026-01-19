import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

function getUserClientFromAuthHeader(req: Request) {
  // Next app router: vamos pegar o token do supabase via cookie/session do client?
  // MVP simples: receber o access_token no header Authorization (Bearer)
  // Mas no nosso checkout atual, não enviamos token.
  // Então faremos: usar cookies do supabase via supabase/auth-helpers depois.
  // Por enquanto: vamos bloquear sem token.
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { cep, rua, numero, complemento, cidade, dia_semana, items } = body || {};
    if (!cep || !rua || !numero || !cidade || !dia_semana || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    // IMPORTANTE (MVP): como estamos server-side, precisamos identificar o usuário.
    // Solução correta: usar @supabase/auth-helpers-nextjs.
    // Para não te travar, faremos um modo simples: exigir Authorization: Bearer <access_token>.
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Não autenticado (faltou Authorization Bearer token)." }, { status: 401 });
    }

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

    // 1) Carregar produtos e preços
    const productIds = items.map((i: any) => Number(i.product_id));
    const { data: prods, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id,nome,preco,ativo")
      .in("id", productIds);

    if (prodErr || !prods || prods.length !== productIds.length) {
      return NextResponse.json({ error: "Produtos inválidos." }, { status: 400 });
    }
    if (prods.some((p: any) => !p.ativo)) {
      return NextResponse.json({ error: "Há produto inativo no carrinho." }, { status: 400 });
    }

    // 2) Buscar frete
    const { data: settingFrete } = await supabaseAdmin.from("settings").select("value").eq("key", "frete_valor").single();
    const frete = Number(settingFrete?.value ?? "7.00");

    // 3) Validar capacidade: soma pedidos PAGOS por dia_semana + produto
    //    (capacidade do dia da semana)
    const { data: caps, error: capErr } = await supabaseAdmin
      .from("daily_capacity")
      .select("product_id,limite_total")
      .eq("dia_semana", Number(dia_semana))
      .in("product_id", productIds);

    if (capErr) return NextResponse.json({ error: "Erro ao consultar capacidade." }, { status: 500 });

    // precisa ter capacidade cadastrada para todos do carrinho
    if (!caps || caps.length !== productIds.length) {
      return NextResponse.json({ error: "Capacidade não configurada para algum produto nesse dia." }, { status: 400 });
    }

    // soma quantidades já vendidas (PAGO)
    const { data: soldRows, error: soldErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("status", "PAGO")
      .eq("dia_semana", Number(dia_semana));

    if (soldErr) return NextResponse.json({ error: "Erro ao consultar pedidos pagos." }, { status: 500 });

    let soldByProduct: Record<number, number> = {};
    if (soldRows && soldRows.length > 0) {
      const orderIds = soldRows.map((o: any) => o.id);
      const { data: soldItems, error: soldItemsErr } = await supabaseAdmin
        .from("order_items")
        .select("product_id,quantidade")
        .in("order_id", orderIds);

      if (soldItemsErr) return NextResponse.json({ error: "Erro ao consultar itens vendidos." }, { status: 500 });

      for (const it of soldItems || []) {
        soldByProduct[it.product_id] = (soldByProduct[it.product_id] || 0) + Number(it.quantidade);
      }
    }

    // valida cada item
    for (const it of items) {
      const pid = Number(it.product_id);
      const qtd = Number(it.quantidade);
      const cap = caps.find((c: any) => c.product_id === pid);
      const ja = soldByProduct[pid] || 0;
      if (ja + qtd > Number(cap.limite_total)) {
        return NextResponse.json({
          error: `Limite excedido para produto ${pid} nesse dia. Restante: ${Math.max(0, Number(cap.limite_total) - ja)}`
        }, { status: 409 });
      }
    }

    // 4) Calcular subtotal/total
    const priceById = new Map(prods.map((p: any) => [p.id, Number(p.preco)]));
    const subtotal = items.reduce((acc: number, it: any) => acc + priceById.get(Number(it.product_id))! * Number(it.quantidade), 0);
    const total = subtotal + frete;

    // 5) Criar order + itens (PENDENTE)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id,
        cidade,
        dia_semana: Number(dia_semana),
        cep, rua, numero,
        complemento: complemento || "",
        subtotal, frete, total,
        status: "PENDENTE"
      })
      .select("id")
      .single();

    if (orderErr || !order) return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });

    const orderItems = items.map((it: any) => {
      const pid = Number(it.product_id);
      const qtd = Number(it.quantidade);
      const preco_unit = priceById.get(pid)!;
      return {
        order_id: order.id,
        product_id: pid,
        quantidade: qtd,
        preco_unit,
        subtotal: preco_unit * qtd
      };
    });

    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(orderItems);
    if (itemsErr) return NextResponse.json({ error: "Erro ao salvar itens." }, { status: 500 });

    return NextResponse.json({ order_id: order.id }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
