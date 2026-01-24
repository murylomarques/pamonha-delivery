// src/app/api/mp/webhook/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type OrderStatus = "PENDENTE" | "PAGO" | "CANCELADO";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function extractPaymentId(req: Request, body: any): string | null {
  // 1) formato comum: { type: "payment", data: { id: "123" } }
  const id1 = body?.data?.id;
  if (id1) return String(id1);

  // 2) alguns casos: { id: "123" }
  const id2 = body?.id;
  if (id2) return String(id2);

  // 3) query: /webhook?id=123 ou /webhook?data.id=123
  const url = new URL(req.url);
  const q1 = url.searchParams.get("id");
  if (q1) return String(q1);

  // 4) resource: "/v1/payments/123"
  const res = body?.resource;
  if (typeof res === "string") {
    const m = res.match(/\/payments\/(\d+)/);
    if (m?.[1]) return String(m[1]);
  }

  // 5) topic/type/action podem vir diferentes, mas o id costuma vir nos lugares acima
  return null;
}

function extractTopic(body: any, req: Request): string {
  const url = new URL(req.url);
  return (
    String(body?.type || body?.topic || body?.action || url.searchParams.get("topic") || "").toLowerCase()
  );
}

function mapMPStatusToOrderStatus(mpStatusRaw: any): OrderStatus {
  const s = String(mpStatusRaw || "").toLowerCase();

  // approved -> PAGO
  if (s === "approved") return "PAGO";

  // rejected/cancelled -> CANCELADO
  if (s === "rejected" || s === "cancelled") return "CANCELADO";

  // pending/in_process/authorized/etc -> PENDENTE
  return "PENDENTE";
}

export async function POST(req: Request) {
  try {
    const WEBHOOK_SECRET = requireEnv("MP_WEBHOOK_SECRET");
    const MP_ACCESS_TOKEN = requireEnv("MP_ACCESS_TOKEN");

    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    // proteção
    if (!secret || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));

    const topic = extractTopic(body, req);
    const paymentId = extractPaymentId(req, body);

    // Mercado Pago manda vários tipos — a gente só processa quando conseguir o paymentId
    if (!paymentId) {
      console.log("[MP WEBHOOK] ignored. topic:", topic, "body_keys:", Object.keys(body || {}));
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Buscar o pagamento no MP com retry (às vezes chega antes do pagamento “existir”)
    let pay: any = null;
    let lastErr: any = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });

      pay = await payRes.json().catch(() => ({}));

      if (payRes.ok) {
        lastErr = null;
        break;
      }

      lastErr = pay;

      // 404 Payment not found -> espera e tenta de novo
      if (payRes.status === 404) {
        console.log("[MP WEBHOOK] payment not found yet:", paymentId, "attempt:", attempt);
        await sleep(800);
        continue;
      }

      // outros erros: não adianta insistir tanto
      console.log("[MP WEBHOOK] payment fetch error:", payRes.status, pay);
      break;
    }

    // Se ainda não encontrou, responde 200 (IMPORTANTÍSSIMO) pra não ficar loopando com 400
    if (lastErr && String(lastErr?.error || "").toLowerCase() === "not_found") {
      console.log("[MP WEBHOOK] ignored (payment not found yet):", paymentId);
      return NextResponse.json({ ok: true, ignored: true, reason: "not_found_yet" });
    }

    // Se falhou por outro motivo, responde 200 mas loga
    if (!pay || !pay?.id) {
      console.log("[MP WEBHOOK] payment invalid response:", pay);
      return NextResponse.json({ ok: true, ignored: true, reason: "invalid_payment" });
    }

    // Pega orderId do external_reference (você setou isso no preference ✅)
    const orderId = String(pay.external_reference || "");
    if (!orderId) {
      console.log("[MP WEBHOOK] warning: sem external_reference. payment:", pay?.id);
      return NextResponse.json({ ok: true, ignored: true, reason: "no_external_reference" });
    }

    const nextStatus = mapMPStatusToOrderStatus(pay.status);
    const admin = supabaseAdmin();

    // Idempotência: não deixar rebaixar pedido já pago
    const { data: current, error: curErr } = await admin
      .from("orders")
      .select("id,status")
      .eq("id", orderId)
      .single();

    if (curErr || !current) {
      console.log("[MP WEBHOOK] order not found:", orderId, "err:", curErr);
      return NextResponse.json({ ok: true, ignored: true, reason: "order_not_found" });
    }

    const curStatus = String(current.status || "PENDENTE").toUpperCase() as OrderStatus;

    // Se já está PAGO, nunca volta pra PENDENTE/CANCELADO por evento fora de ordem
    if (curStatus === "PAGO" && nextStatus !== "PAGO") {
      console.log("[MP WEBHOOK] ignored (already paid):", {
        orderId,
        curStatus,
        mpStatus: pay.status,
        paymentId: String(pay.id),
      });

      // mesmo assim salva payment_id (opcional, mas útil)
      await admin
        .from("orders")
        .update({ mp_payment_id: String(pay.id) })
        .eq("id", orderId);

      return NextResponse.json({ ok: true, ignored: true, reason: "already_paid" });
    }

    // Atualiza pedido
    const { data: updated, error: upErr } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        mp_payment_id: String(pay.id),
      })
      .eq("id", orderId)
      .select("id,status,mp_payment_id")
      .single();

    if (upErr) {
      console.log("[MP WEBHOOK] update error:", upErr);
      // responde 200 pra MP não ficar rebatendo infinito
      return NextResponse.json({ ok: true, warning: "update_failed" });
    }

    console.log("[MP WEBHOOK] pedido atualizado:", updated);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("[MP WEBHOOK] erro:", e?.message || e);
    // responde 200 pra não virar “tempestade” de retry do MP
    return NextResponse.json({ ok: true, warning: "exception" });
  }
}
