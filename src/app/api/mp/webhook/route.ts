// src/app/api/mp/webhook/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Mercado Pago pode mandar:
 * - JSON: { type: "payment", data: { id: "123" } }
 * - JSON: { action: "payment.created", data: { id: "123" } }
 * - query: ?type=payment&data.id=123
 * - query: ?topic=payment&id=123
 * - query: ?topic=merchant_order&id=999  (NÃO É payment!)
 * - JSON com resource/href: "/v1/payments/123" (ou URL completa)
 */
function extractMpEvent(req: Request, body: any): {
  kind?: string;
  paymentId?: string;
  rawId?: string;
  debug: any;
} {
  const url = new URL(req.url);

  // query patterns
  const qKind =
    url.searchParams.get("type") ||
    url.searchParams.get("topic") ||
    undefined;

  const qId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    undefined;

  // body patterns
  const bType = body?.type || body?.topic || undefined;

  // action: "payment.created" -> kind = "payment"
  const action = typeof body?.action === "string" ? body.action : "";
  const bActionKind = action.includes(".") ? action.split(".")[0] : undefined;

  const bId =
    body?.data?.id ||
    body?.id ||
    undefined;

  // resource patterns
  const resource = body?.resource || body?.data?.resource || body?.href;
  let resourcePaymentId: string | undefined;
  let resourceKind: string | undefined;

  if (typeof resource === "string") {
    // payment resource
    const mPay = resource.match(/payments\/(\d+)/);
    if (mPay?.[1]) {
      resourcePaymentId = mPay[1];
      resourceKind = "payment";
    }

    // merchant_order resource (não é payment)
    const mMo = resource.match(/merchant_orders\/(\d+)/);
    if (mMo?.[1]) {
      resourceKind = "merchant_order";
    }
  }

  // prioridade de kind
  const kind = (qKind || bType || bActionKind || resourceKind || undefined)?.toString();

  // prioridade de id
  const rawId = (qId || bId || resourcePaymentId || undefined)?.toString();

  return {
    kind,
    paymentId: rawId, // pode ser merchant_order id — vamos filtrar abaixo
    rawId,
    debug: {
      qKind,
      qId,
      bType,
      action,
      bActionKind,
      bId,
      resource,
      resourceKind,
      resourcePaymentId,
    },
  };
}

async function fetchPaymentWithRetry(paymentId: string, token: string) {
  // O MP às vezes notifica antes do payment ficar disponível
  const waits = [0, 700, 1400]; // ms
  let last: any = null;

  for (const w of waits) {
    if (w) await sleep(w);

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    last = { ok: res.ok, status: res.status, data };

    if (res.ok) return last;

    // 404 pode ser “cedo” OU pode ser “não é payment mesmo”
    if (res.status !== 404) break;
  }

  return last;
}

function mapMpStatus(mpStatusRaw: string): "PENDENTE" | "PAGO" | "CANCELADO" {
  const s = String(mpStatusRaw || "").toLowerCase();

  if (s === "approved") return "PAGO";

  if (s === "rejected" || s === "cancelled" || s === "charged_back" || s === "refunded") {
    return "CANCELADO";
  }

  return "PENDENTE"; // pending, in_process, etc
}

function isTerminal(status: string) {
  const s = String(status || "").toUpperCase();
  return s === "PAGO" || s === "CANCELADO";
}

async function handle(req: Request) {
  try {
    const WEBHOOK_SECRET = requireEnv("MP_WEBHOOK_SECRET");
    const MP_ACCESS_TOKEN = requireEnv("MP_ACCESS_TOKEN");

    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    if (!secret || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // GET pode vir sem body
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const extracted = extractMpEvent(req, body);
    const kind = extracted.kind ? String(extracted.kind).toLowerCase() : undefined;
    const maybeId = extracted.paymentId ? String(extracted.paymentId) : undefined;

    // Se veio tópico diferente de payment, ignora imediatamente
    // (merchant_order é MUITO comum e não é payment)
    if (kind && kind !== "payment") {
      console.log("[MP WEBHOOK] ignored (not payment kind):", { kind, id: maybeId });
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (!maybeId) {
      console.log("[MP WEBHOOK] ignored (no id):", extracted.debug);
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Busca payment no MP (se for 404, pode ser cedo OU id não é payment)
    const paymentRes = await fetchPaymentWithRetry(maybeId, MP_ACCESS_TOKEN);

    if (!paymentRes?.ok) {
      if (paymentRes?.status === 404) {
        console.log("[MP WEBHOOK] ignored (payment not found yet):", maybeId);
        return NextResponse.json({ ok: true, ignored: true });
      }

      console.log("[MP WEBHOOK] payment fetch error:", {
        id: maybeId,
        status: paymentRes?.status,
        data: paymentRes?.data,
      });

      return NextResponse.json({ ok: false, error: paymentRes?.data }, { status: 400 });
    }

    const pay = paymentRes.data;

    const orderId = String(pay?.external_reference || "");
    if (!orderId) {
      console.log("[MP WEBHOOK] warning: sem external_reference:", {
        paymentId: maybeId,
        mpStatus: pay?.status,
      });
      return NextResponse.json({ ok: true, warning: "no external_reference" });
    }

    const nextStatus = mapMpStatus(pay?.status);

    const admin = supabaseAdmin();

    // status atual (pra não permitir regressão)
    const { data: currentOrder, error: curErr } = await admin
      .from("orders")
      .select("id,status,mp_payment_id")
      .eq("id", orderId)
      .single();

    if (curErr || !currentOrder) {
      console.log("[MP WEBHOOK] ignored (order not found):", { orderId, err: curErr?.message });
      return NextResponse.json({ ok: true, ignored: true });
    }

    const curStatus = String(currentOrder.status || "PENDENTE").toUpperCase();

    // 1) Se já terminal, nunca muda pra trás
    if (isTerminal(curStatus) && String(nextStatus).toUpperCase() !== curStatus) {
      console.log("[MP WEBHOOK] ignored (terminal, no downgrade):", { orderId, curStatus, nextStatus });
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 2) Se já é PAGO e veio de novo PAGO, ok (idempotência)
    // 3) Se veio PENDENTE e já estava PENDENTE, ok (sem necessidade)
    if (curStatus === String(nextStatus).toUpperCase() && String(currentOrder.mp_payment_id || "") === String(maybeId)) {
      console.log("[MP WEBHOOK] ok (idempotent):", { orderId, status: curStatus, mp_payment_id: maybeId });
      return NextResponse.json({ ok: true });
    }

    const payload: any = {
      status: nextStatus,
      mp_payment_id: String(maybeId),
    };

    const { data: updated, error: upErr } = await admin
      .from("orders")
      .update(payload)
      .eq("id", orderId)
      .select("id,status,mp_payment_id")
      .single();

    if (upErr) {
      console.log("[MP WEBHOOK] erro update order:", upErr.message);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    console.log("[MP WEBHOOK] pedido atualizado:", updated, {
      mp_status: pay?.status,
      mp_status_detail: pay?.status_detail,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("[MP WEBHOOK] erro:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
