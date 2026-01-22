"use client";

import { useMemo } from "react";

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

export default function PagamentoFalhaPage() {
  const orderId = useMemo(() => getParam("order"), []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 border border-rose-500/20">
            ❌
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Pagamento não concluído</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Pedido: <span className="text-zinc-200">{orderId || "-"}</span>
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
          Se você quiser, volte e tente novamente. O pedido pode continuar como PENDENTE.
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href="/checkout"
            className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Tentar novamente
          </a>
          <a
            href="/minha-conta/pedidos"
            className="rounded-2xl border border-white/10 bg-zinc-950/20 px-4 py-3 text-center text-sm font-semibold hover:bg-white/5"
          >
            Ver meus pedidos
          </a>
        </div>
      </div>
    </div>
  );
}
