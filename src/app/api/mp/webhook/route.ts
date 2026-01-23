import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function mapMpStatus(mpStatus: string): "PENDENTE" | "PAGO" | "CANCELADO" {
  const s = String(mpStatus || "").toLowerCase();

  // aprovado = pago
  if (s === "approved") return "PAGO";

  // cancelado / rejeitado
  if (s === "cancelled" || s === "rejected" || s === "charged_back") return "CANCELADO";

  // pending / in_process / authorized etc -> pendente
  return "PENDENTE";
}

async function fetchPayment(paymentId: string, accessToken: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  // alguns modos antigos (IPN) podem bater com GET
  return handle(req);
}

async function handle(req: Request) {
  try {
    const MP_ACCESS_TOKEN = requireEnv("MP_ACCESS_TOKEN");
    const WEBHOOK_SECRET = requireEnv("MP_WEBHOOK_SECRET");

    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // proteção simples
    if (!secret || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // 1) Tenta pegar paymentId pelo formato IPN (topic/id na URL)
    const topic = url.searchParams.get("topic") || url.searchParams.get("type") || "";
    const idFromQuery = url.searchParams.get("id") || url.searchParams.get("data.id") || "";

    let paymentId: string | undefined = idFromQuery || undefined;

    // 2) Se não veio por query, tenta body (webhook v2)
    let body: any = null;
    if (!paymentId) {
      body = await req.json().catch(() => null);

      // Webhooks v2 costuma vir: { type: "payment", data: { id: "123" } }
      const type = body?.type;
      const dataId = body?.data?.id;

      // Alguns eventos vêm com action + data.id
      const action = body?.action;

      if (dataId && (type === "payment" || String(action || "").includes("payment"))) {
        paymentId = String(dataId);
      }

      // Alguns formatos alternativos (só pra não perder evento)
      if (!paymentId && body?.id && (type === "payment" || topic === "payment")) {
        paymentId = String(body.id);
      }
    }

    // Se ainda não temos paymentId, ignoramos sem erro (pra não ficar retry infinito)
    if (!paymentId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "no paymentId" });
    }

    // 3) Confirma no MP (NUNCA confiar só no webhook)
    const payRes = await fetchPayment(paymentId, MP_ACCESS_TOKEN);
    if (!payRes.ok) {
      return NextResponse.json(
        { ok: false, error: "mp_fetch_failed", status: payRes.status, mp: payRes.json },
        { status: 400 }
      );
    }

    const pay = payRes.json;

    const mpStatus = String(pay.status || "");
    const orderId = String(pay.external_reference || "");

    if (!orderId) {
      return NextResponse.json({ ok: true, warning: "sem external_reference", mpStatus });
    }

    const nextStatus = mapMpStatus(mpStatus);

    const admin = supabaseAdmin();

    // 4) Atualiza o pedido
    const { error: updErr } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        mp_payment_id: String(paymentId),
      })
      .eq("id", orderId);

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      orderId,
      paymentId,
      mpStatus,
      nextStatus,
      topic,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
