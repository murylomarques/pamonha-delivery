"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OrderStatus = "PENDENTE" | "PAGO" | "CANCELADO";

type OrderRow = {
  id: string;
  status: OrderStatus;
  total: number;
  mp_payment_id: string | null;
  created_at: string;
};

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return String(d);
  }
}

function Inner() {
  const sp = useSearchParams();
  const router = useRouter();

  const orderId = useMemo(() => sp.get("order") || "", [sp]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [info, setInfo] = useState<string>("");

  // evita bug de "tries" stale dentro do setTimeout
  const triesRef = useRef(0);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stoppedRef.current = false;

    if (!orderId) {
      setInfo("Pedido não informado na URL.");
      setLoading(false);
      return;
    }

    async function loadOnce() {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total,mp_payment_id,created_at")
        .eq("id", orderId)
        .single();

      if (stoppedRef.current) return;

      if (error || !data) {
        setInfo("Não encontramos esse pedido.");
        setOrder(null);
        setLoading(false);
        return;
      }

      setOrder(data as any);
      setLoading(false);

      if (data.status === "PAGO") {
        setInfo("Pagamento confirmado ✅ Redirecionando...");
        timerRef.current = setTimeout(() => {
          if (!stoppedRef.current) router.push(`/pagamento/sucesso?order=${encodeURIComponent(orderId)}`);
        }, 800);
        return;
      }

      if (data.status === "CANCELADO") {
        setInfo("Pagamento cancelado ❌ Redirecionando...");
        timerRef.current = setTimeout(() => {
          if (!stoppedRef.current) router.push(`/pagamento/falha?order=${encodeURIComponent(orderId)}`);
        }, 800);
        return;
      }

      setInfo("Aguardando confirmação do pagamento ⏳");
      triesRef.current += 1;

      const t = triesRef.current;
      const nextMs = t < 5 ? 2000 : t < 20 ? 3000 : 4500;

      timerRef.current = setTimeout(loadOnce, nextMs);
    }

    loadOnce();

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [orderId, router]);

  return (
    <div className="mx-auto max-w-2xl p-6 text-zinc-100">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pagamento pendente</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Em PIX é normal demorar um pouco. Essa tela consulta o status real do pedido no Supabase.
        </p>

        <div className="mt-6 grid gap-4">
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5">
            <div className="text-xs text-amber-200/80">STATUS</div>
            <div className="mt-1 text-lg font-semibold text-amber-100">{info || "..."}</div>
            <div className="mt-2 text-xs text-amber-200/70">
              Dica: se você acabou de pagar, aguarde alguns segundos para o Mercado Pago confirmar e o webhook atualizar.
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950/20 p-5">
            {loading ? (
              <div className="animate-pulse text-sm text-zinc-300">Carregando pedido...</div>
            ) : !order ? (
              <div className="text-sm text-rose-200">{info || "Pedido não encontrado."}</div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Pedido</span>
                  <span className="font-semibold">{order.id}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Status (BD)</span>
                  <span
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                      order.status === "PAGO"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                        : order.status === "CANCELADO"
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                        : "border-amber-500/20 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Total</span>
                  <span className="font-semibold">{formatBRL(Number(order.total))}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Criado</span>
                  <span className="font-semibold">{fmtDate(order.created_at)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">MP Payment ID</span>
                  <span className="font-semibold">{order.mp_payment_id || "-"}</span>
                </div>

                <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-300">
                  Se o pagamento já foi feito e continuar pendente por muito tempo, pode ser que o webhook tenha atrasado.
                  Essa tela vai atualizar sozinha.
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push(`/pagamento/pendente?order=${encodeURIComponent(orderId)}`)}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              Atualizar agora
            </button>

            <button
              onClick={() => router.push("/minha-conta/pedidos")}
              className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Ver meus pedidos
            </button>

            <button
              onClick={() => router.push("/")}
              className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Voltar para o início
            </button>
          </div>

          <div className="text-xs text-zinc-500">
            Observação: URL de sucesso/pendente/falha não “aprova” nada. O que vale é o status salvo no banco via webhook.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PagamentoPendentePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-6 text-zinc-100">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="animate-pulse text-sm text-zinc-300">Carregando...</div>
          </div>
        </div>
      }
    >
      <Inner />
    </Suspense>
  );
}
