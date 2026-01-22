"use client";

import { useEffect, useMemo, useState } from "react";

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

export default function PagamentoSucessoPage() {
  const orderId = useMemo(() => getParam("order"), []);
  const paymentId = useMemo(
    () => getParam("payment_id") || getParam("collection_id"),
    []
  );

  const [status, setStatus] = useState<"loading" | "ok" | "warn" | "err">("loading");
  const [text, setText] = useState("Confirmando pagamento...");

  useEffect(() => {
    (async () => {
      try {
        if (!orderId) {
          setStatus("err");
          setText("Pedido não informado na URL.");
          return;
        }

        // Se não veio payment_id, ainda assim mostra sucesso e deixa o webhook agir
        if (!paymentId) {
          setStatus("warn");
          setText("Pagamento recebido. Estamos aguardando confirmação automática (webhook).");
          return;
        }

        const r = await fetch("/api/mp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, paymentId }),
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus("warn");
          setText("Pagamento retornou sucesso, mas não consegui confirmar agora. Aguarde alguns segundos.");
          return;
        }

        setStatus("ok");
        setText(`Pagamento confirmado! Status do pedido: ${j.status}`);
      } catch {
        setStatus("warn");
        setText("Pagamento retornou sucesso. Se o status não atualizar em alguns minutos, recarregue a página.");
      }
    })();
  }, [orderId, paymentId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            ✅
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Pagamento concluído</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Pedido: <span className="text-zinc-200">{orderId || "-"}</span>
            </p>
          </div>
        </div>

        <div
          className={`mt-5 rounded-2xl border p-4 text-sm ${
            status === "ok"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : status === "err"
              ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
              : "border-amber-500/20 bg-amber-500/10 text-amber-200"
          }`}
        >
          {text}
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

        <p className="mt-4 text-xs text-zinc-500">
          Se o status não mudar na hora, pode levar alguns segundos até o webhook processar.
        </p>
      </div>
    </div>
  );
}
