import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // ou supabaseServer dependendo do seu projeto

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`ENV ausente: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    const WEBHOOK_SECRET = mustEnv("MP_WEBHOOK_SECRET");
    const MP_ACCESS_TOKEN = mustEnv("MP_ACCESS_TOKEN");

    console.log("[MP WEBHOOK] hit:", req.url);

    // Proteção simples
    if (!secret || secret !== WEBHOOK_SECRET) {
      console.log("[MP WEBHOOK] unauthorized. secret recebido:", secret);
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    console.log("[MP WEBHOOK] body:", JSON.stringify(body));

    const paymentId = body?.data?.id;
    const type = body?.type;

    if (!paymentId || type !== "payment") {
      console.log("[MP WEBHOOK] ignored. type:", type, "paymentId:", paymentId);
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Confirma status real no MP
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
      console.log("[MP WEBHOOK] sem external_reference no pagamento:", paymentId);
      return NextResponse.json({ ok: true, warning: "sem external_reference" });
    }

    let nextStatus: "PENDENTE" | "PAGO" | "CANCELADO" = "PENDENTE";
    if (mpStatus === "approved") nextStatus = "PAGO";
    else if (mpStatus === "rejected" || mpStatus === "cancelled") nextStatus = "CANCELADO";
    else nextStatus = "PENDENTE";

    // ⚠️ IMPORTANTE: se seu supabaseAdmin for FUNÇÃO, precisa chamar:
    // const admin = supabaseAdmin();
    // se ele já for CLIENTE pronto, usa direto:
    const admin: any = typeof supabaseAdmin === "function" ? supabaseAdmin() : supabaseAdmin;

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
      console.log("[MP WEBHOOK] erro ao atualizar pedido:", upErr);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    console.log("[MP WEBHOOK] pedido atualizado:", updated);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("[MP WEBHOOK] erro geral:", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
