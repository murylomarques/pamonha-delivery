"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Order = {
  id: string;
  status: "PENDENTE" | "PAGO" | "CANCELADO";
  cidade: string;
  dia_semana: number;
  total: number;
  created_at: string;
};

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function badgeClass(status: Order["status"]) {
  if (status === "PAGO") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  if (status === "PENDENTE") return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  return "border-rose-500/20 bg-rose-500/10 text-rose-200";
}

export default function MeusPedidos() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todos" | "pendente" | "pago">("todos");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }

      setLoading(true);
      const { data: ords } = await supabase
        .from("orders")
        .select("id,status,cidade,dia_semana,total,created_at")
        .order("created_at", { ascending: false });

      setOrders((ords || []) as Order[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (tab === "todos") return orders;
    if (tab === "pendente") return orders.filter((o) => o.status === "PENDENTE");
    return orders.filter((o) => o.status === "PAGO");
  }, [orders, tab]);

  const pendentes = useMemo(() => orders.filter((o) => o.status === "PENDENTE").length, [orders]);
  const pagos = useMemo(() => orders.filter((o) => o.status === "PAGO").length, [orders]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">📦</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Minha conta</p>
              <p className="text-base font-semibold tracking-tight">Meus pedidos</p>
            </div>
          </a>

          <div className="flex items-center gap-2">
            <a
              href="/carrinho"
              className="hidden rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 sm:inline-flex"
            >
              Carrinho
            </a>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              ← Loja
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Top card */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Seus pedidos</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Veja pendentes, pagos e o histórico das suas compras.
              </p>
            </div>

            <div className="flex gap-2">
              <div className="rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3 text-sm">
                <span className="text-zinc-400">Pendentes: </span>
                <span className="font-semibold text-zinc-100">{pendentes}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/30 px-4 py-3 text-sm">
                <span className="text-zinc-400">Pagos: </span>
                <span className="font-semibold text-zinc-100">{pagos}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setTab("todos")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === "todos" ? "bg-white text-zinc-900" : "text-zinc-200 hover:bg-white/5"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTab("pendente")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === "pendente" ? "bg-white text-zinc-900" : "text-zinc-200 hover:bg-white/5"
              }`}
            >
              Pendentes
            </button>
            <button
              onClick={() => setTab("pago")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                tab === "pago" ? "bg-white text-zinc-900" : "text-zinc-200 hover:bg-white/5"
              }`}
            >
              Pagos
            </button>
          </div>
        </section>

        {/* List */}
        <section className="mt-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
              Nenhum pedido por aqui ainda.
              <div className="mt-4">
                <a
                  href="/"
                  className="inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
                >
                  Fazer um pedido
                </a>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filtered.map((o) => (
                <div
                  key={o.id}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-400">Entrega</p>
                      <p className="mt-1 text-lg font-semibold tracking-tight">
                        {DIAS[o.dia_semana]} • {o.cidade}
                      </p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className={`inline-flex rounded-2xl border px-3 py-2 text-xs font-semibold ${badgeClass(o.status)}`}>
                        {o.status}
                      </div>
                      <p className="mt-3 text-lg font-semibold">{formatBRL(Number(o.total))}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-zinc-400">
                      <span className="text-zinc-200">ID:</span> {o.id}
                    </div>

                    {/* (depois) botão "Pagar agora" quando integrar Mercado Pago */}
                    {o.status === "PENDENTE" ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                        Aguardando pagamento
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
