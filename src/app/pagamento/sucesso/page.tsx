"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OrderStatus = "PENDENTE" | "PAGO" | "CANCELADO";

type OrderRow = {
  id: string;
  user_id: string;
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

export default function PagamentoSucessoPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const orderId = useMemo(() => sp.get("order") || "", [sp]);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [info, setInfo] = useState<string>("");

  useEffect(() => {
    let stopped = false;

    async function run() {
      try {
        if (!orderId) {
          setInfo("Pedido não informado.");
          setLoading(false);
          return;
        }

        // 1) exige usuário logado
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;

        if (!user) {
          // se não estiver logado, manda pro login
          router.replace(`/login?next=${encodeURIComponent(`/pagamento/sucesso?order=${orderId}`)}`);
          return;
        }

        // 2) busca pedido
        const { data, error } = await supabase
          .from("orders")
          .select("id,user_id,status,total,mp_payment_id,created_at")
          .eq("id", orderId)
          .single();

        if (stopped) return;

        if (error || !data) {
          setInfo("Pedido não encontrado.");
          setOrder(null);
          setLoading(false);
          return;
        }

        // 3) só dono (ou admin via RLS/policy) pode ver
        // Se sua RLS permitir apenas o dono, isso já bloqueia automaticamente.
        // Mesmo assim, deixo a validação extra:
        if (data.user_id !== user.id) {
          setInfo("Você não tem permissão para ver esse pedido.");
          setOrder(null);
          setLoading(false);
          return;
        }

        // 4) trava a tela pelo STATUS real do banco
        if (data.status === "PENDENTE") {
          router.replace(`/pagamento/pendente?order=${encodeURIComponent(orderId)}`);
          return;
        }

        if (data.status === "CANCELADO") {
          router.replace(`/pagamento/falha?order=${encodeURIComponent(orderId)}`);
          return;
        }

        // status PAGO
        setOrder(data as any);
        setInfo("Pagamento confirmado ✅");
        setLoading(false);
      } catch {
        if (!stopped) {
          setInfo("Erro ao verificar o pedido.");
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      stopped = true;
    };
  }, [orderId, router]);

  return (
    <div className="mx-auto max-w-2xl p-6 text-zinc-100">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pagamento confirmado ✅</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Esta tela só aparece quando o status do pedido está <b>PAGO</b> no banco (webhook).
        </p>

        <div className="mt-6 grid gap-4">
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
            <div className="text-xs text-emerald-200/80">STATUS</div>
            <div className="mt-1 text-lg font-semibold text-emerald-100">{info || "..."}</div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950/20 p-5">
            {loading ? (
              <div className="animate-pulse text-sm text-zinc-300">Verificando pedido...</div>
            ) : !order ? (
              <div className="text-sm text-rose-200">{info || "Não foi possível carregar."}</div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Pedido</span>
                  <span className="font-semibold">{order.id}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Status (BD)</span>
                  <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
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
                  Segurança: entrar direto nessa URL não aprova nada — o que vale é o status do pedido no banco.
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/minha-conta/pedidos")}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
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
        </div>
      </div>
    </div>
  );
}
