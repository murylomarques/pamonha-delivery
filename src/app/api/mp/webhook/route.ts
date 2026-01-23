import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV ausente: ${name}`);
  return v;
}

// só pra deixar claro a prioridade de status
const PRIORITY: Record<string, number> = {
  PENDENTE: 1,
  CANCELADO: 2,
  PAGO: 3,
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    const WEBHOOK_SECRET = mustEnv("MP_WEBHOOK_SECRET");
    const MP_ACCESS_TOKEN = mustEnv("MP_ACCESS_TOKEN");

    if (!secret || secret !== WEBHOOK_SECRET) {
      console.log("[MP WEBHOOK] unauthorized");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    console.log("[MP WEBHOOK] body:", JSON.stringify(body));

    // MP pode mandar o ID em formatos diferentes
    const paymentId =
      body?.data?.id ||
      body?.id ||
      body?.resource?.split("/")?.pop() ||
      body?.resource_id;

    if (!paymentId) {
      console.log("[MP WEBHOOK] ignored (sem paymentId)");
      return NextResponse.json({ ok: true, ignored: true });
    }

    // busca o pagamento real no MP
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    const pay = await payRes.json();
    console.log("[MP WEBHOOK] payment fetch status:", payRes.status);
    console.log("[MP WEBHOOK] payment data:", JSON.stringify(pay));

    if (!payRes.ok) {
      return NextResponse.json({ ok: false, error: pay }, { status: 400 });
    }

    const mpStatus = String(pay.status || "").toLowerCase();
    const orderId = String(pay.external_reference || "");

    if (!orderId) {
      console.log("[MP WEBHOOK] sem external_reference");
      return NextResponse.json({ ok: true, warning: "sem external_reference" });
    }

    // mapeia status do MP -> seu status do sistema
    let nextStatus: "PENDENTE" | "PAGO" | "CANCELADO" | null = null;

    if (mpStatus === "approved") nextStatus = "PAGO";
    else if (mpStatus === "rejected" || mpStatus === "cancelled") nextStatus = "CANCELADO";
    else {
      // in_process, pending, etc
      nextStatus = "PENDENTE";
    }

    const admin: any = typeof supabaseAdmin === "function" ? supabaseAdmin() : supabaseAdmin;

    // pega status atual do pedido
    const { data: current, error: curErr } = await admin
      .from("orders")
      .select("id,status")
      .eq("id", orderId)
      .single();

    if (curErr || !current) {
      console.log("[MP WEBHOOK] pedido não encontrado:", orderId, curErr);
      return NextResponse.json({ ok: false, error: "pedido não encontrado" }, { status: 404 });
    }

    const currentStatus = String(current.status || "PENDENTE");

    // ✅ NÃO rebaixa status (se já é PAGO, não volta pra PENDENTE)
    if (PRIORITY[nextStatus] < PRIORITY[currentStatus]) {
      console.log("[MP WEBHOOK] ignorado por downgrade", { currentStatus, nextStatus });
      return NextResponse.json({ ok: true, ignored: true, reason: "downgrade" });
    }

    // atualiza
    const { data: updated, error: upErr } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        mp_payment_id: String(paymentId),
      })
      .eq("id", orderId)
      .select("id,status,mp_payment_id")
      .single();

    if (upErr) {
      console.log("[MP WEBHOOK] erro update:", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    console.log("[MP WEBHOOK] pedido atualizado:", updated);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("[MP WEBHOOK] erro geral:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
