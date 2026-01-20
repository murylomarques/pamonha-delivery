import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();

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

    // MVP: exige Authorization Bearer <access_token>
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
      return NextResponse.json(
        { error: "Não autenticado (faltou Authorization Bearer token)." },
        { status: 401 }
      );
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

    // normaliza items (garante numero)
    const normItems = items.map((i: any) => ({
      product_id: Number(i.product_id),
      quantidade: Number(i.quantidade),
    }));

    // ids únicos (importante pra capacidade/produtos)
    const productIdsUnique = Array.from(new Set(normItems.map((i) => i.product_id)));

    // 1) Carregar produtos e preços
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

    // 2) Buscar frete
    const { data: settingFrete } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "frete_valor")
      .single();

    const frete = Number(settingFrete?.value ?? "7.00");

    // 3) Capacidade do dia por produto
    const { data: caps, error: capErr } = await supabaseAdmin
      .from("daily_capacity")
      .select("product_id,limite_total")
      .eq("dia_semana", Number(dia_semana))
      .in("product_id", productIdsUnique);

    if (capErr) {
      return NextResponse.json({ error: "Erro ao consultar capacidade." }, { status: 500 });
    }

    // monta mapa de capacidade (product_id -> limite_total)
    const capByProduct = new Map<number, number>();
    for (const c of caps || []) {
      capByProduct.set(Number(c.product_id), Number(c.limite_total));
    }

    // se faltar capacidade pra algum produto
    for (const pid of productIdsUnique) {
      if (!capByProduct.has(pid)) {
        return NextResponse.json(
          { error: "Capacidade não configurada para algum produto nesse dia." },
          { status: 400 }
        );
      }
    }

    // soma quantidades já vendidas (PAGO) no mesmo dia_semana
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

    // valida cada item
    for (const it of normItems) {
      const pid = it.product_id;
      const qtd = it.quantidade;

      if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(qtd) || qtd <= 0) {
        return NextResponse.json({ error: "Item inválido no carrinho." }, { status: 400 });
      }

      const limite = capByProduct.get(pid);
      if (limite === undefined) {
        // TS resolvido + segurança
        return NextResponse.json(
          { error: `Capacidade não configurada para produto ${pid} nesse dia.` },
          { status: 400 }
        );
      }

      const ja = soldByProduct[pid] || 0;
      if (ja + qtd > limite) {
        return NextResponse.json(
          {
            error: `Limite excedido para produto ${pid} nesse dia. Restante: ${Math.max(
              0,
              limite - ja
            )}`,
          },
          { status: 409 }
        );
      }
    }

    // 4) Calcular subtotal/total
    const priceById = new Map<number, number>(prods.map((p: any) => [Number(p.id), Number(p.preco)]));
    const subtotal = normItems.reduce((acc: number, it) => {
      const price = priceById.get(it.product_id);
      if (price === undefined) return acc; // segurança
      return acc + price * it.quantidade;
    }, 0);

    const total = subtotal + frete;

    // 5) Criar order + itens (PENDENTE)
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id,
        cidade,
        dia_semana: Number(dia_semana),
        cep,
        rua,
        numero,
        complemento: complemento || "",
        subtotal,
        frete,
        total,
        status: "PENDENTE",
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });
    }

    const orderItems = normItems.map((it) => {
      const preco_unit = priceById.get(it.product_id) || 0;
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
  } catch {
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
