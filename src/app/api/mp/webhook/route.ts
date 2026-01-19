import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET!;
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN!;

    // Proteção simples (já resolve 99% do “spam” no webhook)
    if (!secret || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Em geral vem assim:
    // { "type":"payment", "data": { "id": "123" } }
    const paymentId = body?.data?.id;
    const type = body?.type;

    if (!paymentId || type !== "payment") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Confirma no MP buscando o pagamento (mais confiável do que confiar só no webhook)
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });

    const pay = await payRes.json();

    if (!payRes.ok) {
      return NextResponse.json({ ok: false, error: pay }, { status: 400 });
    }

    // Você quer mapear:
    // approved -> PAGO
    // rejected/cancelled -> CANCELADO
    // in_process/pending -> PENDENTE
    const status = String(pay.status || "").toLowerCase();
    const orderId = String(pay.external_reference || "");

    if (!orderId) {
      return NextResponse.json({ ok: true, warning: "sem external_reference" });
    }

    let nextStatus: "PENDENTE" | "PAGO" | "CANCELADO" = "PENDENTE";
    if (status === "approved") nextStatus = "PAGO";
    else if (status === "rejected" || status === "cancelled") nextStatus = "CANCELADO";
    else nextStatus = "PENDENTE";

    const admin = supabaseAdmin();

    await admin
      .from("orders")
      .update({
        status: nextStatus,
        mp_payment_id: String(paymentId),
      })
      .eq("id", orderId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
