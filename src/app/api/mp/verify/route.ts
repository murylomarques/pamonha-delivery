import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const MP_ACCESS_TOKEN = requireEnv("MP_ACCESS_TOKEN");

    const body = await req.json().catch(() => ({} as any));
    const orderId = String(body?.orderId || "");
    const paymentId = String(body?.paymentId || "");

    if (!orderId || !paymentId) {
      return NextResponse.json({ error: "orderId e paymentId são obrigatórios." }, { status: 400 });
    }

    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const pay = await payRes.json();
    if (!payRes.ok) return NextResponse.json({ error: pay }, { status: 400 });

    const status = String(pay.status || "").toLowerCase();

    let nextStatus: "PENDENTE" | "PAGO" | "CANCELADO" = "PENDENTE";
    if (status === "approved") nextStatus = "PAGO";
    else if (status === "rejected" || status === "cancelled") nextStatus = "CANCELADO";
    else nextStatus = "PENDENTE";

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("orders")
      .update({
        status: nextStatus,
        mp_payment_id: String(paymentId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
