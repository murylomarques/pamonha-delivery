"use client";

import { useMemo } from "react";

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

export default function PagamentoPendentePage() {
  const orderId = useMemo(() => getParam("order"), []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
            ⏳
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Pagamento pendente</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Pedido: <span className="text-zinc-200">{orderId || "-"}</span>
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
          Assim que o pagamento for confirmado, o status do pedido muda automaticamente.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href="/minha-conta/pedidos"
            className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Ver meus pedidos
          </a>
          <a
            href="/"
            className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-center text-sm font-semibold hover:bg-white/5"
          >
            Voltar pra loja
          </a>
        </div>
      </div>
    </div>
  );
}
