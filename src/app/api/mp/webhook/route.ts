import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV ausente: ${name}`);
  return v;
}

const PRIORITY: Record<string, number> = {
  PENDENTE: 1,
  CANCELADO: 2,
  PAGO: 3,
};

function isNumericId(v: any) {
  const s = String(v ?? "").trim();
  return /^[0-9]+$/.test(s);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const WEBHOOK_SECRET = mustEnv("MP_WEBHOOK_SECRET");

    if (!secret || secret !== WEBHOOK_SECRET) {
      console.log("[MP WEBHOOK] unauthorized");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const MP_ACCESS_TOKEN = mustEnv("MP_ACCESS_TOKEN");

    const body = await req.json().catch(() => null);

    // O MP pode mandar em formatos diferentes:
    // - body.data.id (quando é payment)
    // - query params (?id=...&topic=payment)
    // - body.resource (às vezes é uma URL)
    const qpId = url.searchParams.get("id");
    const qpTopic = url.searchParams.get("topic") || url.searchParams.get("type");

    const paymentIdRaw =
      body?.data?.id ??
      body?.id ??
      qpId ??
      body?.resource?.split("/")?.pop() ??
      body?.resource_id;

    const typeRaw = body?.type ?? qpTopic ?? body?.action ?? body?.topic;

    console.log("[MP WEBHOOK] type:", typeRaw, "paymentIdRaw:", paymentIdRaw);

    // ✅ Se não tiver id ou não for numérico, isso NÃO é paymentId
    // (é um merchant_order, ou outra notificação)
    if (!paymentIdRaw || !isNumericId(paymentIdRaw)) {
      console.log("[MP WEBHOOK] ignored (not a payment id).", {
        type: typeRaw,
        paymentIdRaw,
      });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const paymentId = String(paymentIdRaw);

    // Busca o pagamento real no MP (fonte de verdade)
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    const pay = await payRes.json().catch(() => ({}));
    console.log("[MP WEBHOOK] payment fetch status:", payRes.status);
    console.log("[MP WEBHOOK] payment data:", JSON.stringify(pay));

    // ✅ Se deu 404 aqui, pode ser evento “adiantado”/ruim. NÃO retorna 400.
    // Retorna 200 pra não ficar retry infinito.
    if (payRes.status === 404) {
      console.log("[MP WEBHOOK] ignored (payment not found yet):", paymentId);
      return NextResponse.json({ ok: true, ignored: true, reason: "payment_not_found" });
    }

    if (!payRes.ok) {
      console.log("[MP WEBHOOK] ignored (mp error):", payRes.status);
      return NextResponse.json({ ok: true, ignored: true, reason: "mp_error" });
    }

    const mpStatus = String(pay.status || "").toLowerCase();
    const orderId = String(pay.external_reference || "");

    if (!orderId) {
      console.log("[MP WEBHOOK] ignored (sem external_reference)");
      return NextResponse.json({ ok: true, ignored: true, reason: "no_external_reference" });
    }

    let nextStatus: "PENDENTE" | "PAGO" | "CANCELADO" = "PENDENTE";
    if (mpStatus === "approved") nextStatus = "PAGO";
    else if (mpStatus === "rejected" || mpStatus === "cancelled") nextStatus = "CANCELADO";
    else nextStatus = "PENDENTE";

    const admin: any = typeof supabaseAdmin === "function" ? supabaseAdmin() : supabaseAdmin;

    // Status atual do pedido
    const { data: current, error: curErr } = await admin
      .from("orders")
      .select("id,status")
      .eq("id", orderId)
      .single();

    if (curErr || !current) {
      console.log("[MP WEBHOOK] pedido não encontrado:", orderId, curErr);
      return NextResponse.json({ ok: true, ignored: true, reason: "order_not_found" });
    }

    const currentStatus = String(current.status || "PENDENTE");

    // ✅ Nunca “rebaixa” (PAGO não volta pra PENDENTE)
    if (PRIORITY[nextStatus] < PRIORITY[currentStatus]) {
      console.log("[MP WEBHOOK] ignored downgrade", { currentStatus, nextStatus, paymentId });
      return NextResponse.json({ ok: true, ignored: true, reason: "downgrade" });
    }

    const { data: updated, error: upErr } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        mp_payment_id: paymentId,
      })
      .eq("id", orderId)
      .select("id,status,mp_payment_id")
      .single();

    if (upErr) {
      console.log("[MP WEBHOOK] erro update:", upErr);
      // também não retorna 500 pro MP ficar retryando eternamente
      return NextResponse.json({ ok: true, ignored: true, reason: "db_error" });
    }

    console.log("[MP WEBHOOK] pedido atualizado:", updated);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("[MP WEBHOOK] erro geral:", e?.message || e);
    // ❗ importante: 200 mesmo com erro pra evitar spam de retry
    return NextResponse.json({ ok: true, ignored: true, reason: "exception" });
  }
}
