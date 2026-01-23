import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type BodyItem = {
  id: number; // product_id
  nome: string;
  preco: number;
  qtd: number;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function baseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";

  return raw.replace(/\/+$/, "");
}

function isPublicHttps(url: string) {
  if (!url.startsWith("https://")) return false;
  if (url.includes("localhost")) return false;
  if (url.includes("127.0.0.1")) return false;
  return true;
}

export async function POST(req: Request) {
  try {
    const MP_ACCESS_TOKEN = requireEnv("MP_ACCESS_TOKEN");
    const WEBHOOK_SECRET = requireEnv("MP_WEBHOOK_SECRET");

    const siteUrl = baseUrl();
    const admin = supabaseAdmin();

    const body = await req.json().catch(() => ({} as any));
    const orderId: string | undefined = body?.orderId;

    const itemsRaw: BodyItem[] = Array.isArray(body?.items) ? body.items : [];
    const frete: number = Number(body?.frete || 0);

    if (!orderId) {
      return NextResponse.json({ error: "orderId é obrigatório." }, { status: 400 });
    }
    if (!itemsRaw.length) {
      return NextResponse.json({ error: "Sem itens para criar preferência." }, { status: 400 });
    }

    const mpItems = itemsRaw.map((it) => ({
      id: String(it.id),
      title: String(it.nome || `Produto ${it.id}`),
      quantity: Number(it.qtd || 1),
      unit_price: Number(it.preco || 0),
      currency_id: "BRL",
    }));

    if (frete > 0) {
      mpItems.push({
        id: "FRETE",
        title: "Frete",
        quantity: 1,
        unit_price: frete,
        currency_id: "BRL",
      });
    }

    const back_urls = {
      success: `${siteUrl}/pagamento/sucesso?order=${encodeURIComponent(orderId)}`,
      pending: `${siteUrl}/pagamento/pendente?order=${encodeURIComponent(orderId)}`,
      failure: `${siteUrl}/pagamento/falha?order=${encodeURIComponent(orderId)}`,
    };

    // 🔥 GARANTIA: manda o webhook SEM depender de config no painel
    // (se seu MP mandar webhook em outro formato, o endpoint abaixo vai aceitar também)
    const notification_url = `${siteUrl}/api/mp/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;

    const payload: any = {
      items: mpItems,
      back_urls,
      external_reference: String(orderId),
      notification_url,
    };

    if (isPublicHttps(siteUrl)) {
      payload.auto_return = "approved";
    }

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    if (!r.ok) {
      return NextResponse.json(
        { error: "Mercado Pago recusou a preference", mp: data },
        { status: 400 }
      );
    }

    // ✅ salva o preference_id no pedido (ajuda MUITO no debug)
    await admin
      .from("orders")
      .update({ mp_preference_id: String(data.id) })
      .eq("id", orderId);

    return NextResponse.json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
