import { NextResponse } from "next/server";

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

    // Itens no formato MP
    const mpItems = itemsRaw.map((it) => ({
      id: String(it.id),
      title: String(it.nome || `Produto ${it.id}`),
      quantity: Number(it.qtd || 1),
      unit_price: Number(it.preco || 0),
      currency_id: "BRL",
    }));

    // cobra frete como item separado
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

    // ✅ webhook com secret na URL
    const notification_url = `${siteUrl}/api/mp/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`;

    const payload: any = {
      items: mpItems,
      back_urls,
      external_reference: String(orderId),
      notification_url, // ✅ ESSENCIAL PRA ATUALIZAR STATUS
    };

    // evita erro em dev e deixa auto-return só quando for https público
    if (isPublicHttps(siteUrl)) {
      payload.auto_return = "approved";
    }

    console.log("[MP preference] siteUrl:", siteUrl);
    console.log("[MP preference] notification_url:", notification_url);
    console.log("[MP preference] payload:", JSON.stringify(payload, null, 2));

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    console.log("[MP preference] status:", r.status);
    console.log("[MP preference] response:", data);

    if (!r.ok) {
      return NextResponse.json({ error: "Mercado Pago recusou a preference", mp: data }, { status: 400 });
    }

    return NextResponse.json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
