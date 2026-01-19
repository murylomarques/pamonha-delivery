"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type CartItem = { product_id: number; nome: string; preco: number; qtd: number };

function formatBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyLike(v: any): number {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default function Carrinho() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [freteBase, setFreteBase] = useState<number>(7); // fallback
  const [freteLoading, setFreteLoading] = useState<boolean>(true);

  useEffect(() => {
    const raw = localStorage.getItem("cart");
    setItems(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => {
    (async () => {
      setFreteLoading(true);

      // tenta "frete" primeiro
      const { data: s1 } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "frete")
        .maybeSingle();

      // se não existir, tenta "frete_padrao"
      const { data: s2 } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "frete_valor")
        .maybeSingle();

      const raw = s1?.value ?? s2?.value;
      const n = parseMoneyLike(raw);

      if (Number.isFinite(n) && n >= 0) setFreteBase(n);
      else setFreteBase(7); // fallback seguro

      setFreteLoading(false);
    })();
  }, []);

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + Number(i.preco) * i.qtd, 0),
    [items]
  );

  function save(next: CartItem[]) {
    setItems(next);
    localStorage.setItem("cart", JSON.stringify(next));
  }

  function inc(id: number) {
    save(items.map((x) => (x.product_id === id ? { ...x, qtd: x.qtd + 1 } : x)));
  }

  function dec(id: number) {
    save(items.map((x) => (x.product_id === id ? { ...x, qtd: Math.max(1, x.qtd - 1) } : x)));
  }

  function remove(id: number) {
    save(items.filter((x) => x.product_id !== id));
  }

  const frete = items.length ? freteBase : 0;
  const total = subtotal + frete;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🛒</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Carrinho</p>
              <p className="text-base font-semibold tracking-tight">Seus itens</p>
            </div>
          </a>

          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            ← Voltar pra loja
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
        {/* Lista */}
        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h1 className="text-xl font-semibold tracking-tight">Carrinho</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Ajuste as quantidades e finalize quando estiver pronto.
            </p>
          </div>

          {items.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-zinc-300">Seu carrinho está vazio.</p>
              <a
                href="/"
                className="mt-4 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Ver produtos
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((i) => {
                const lineTotal = Number(i.preco) * i.qtd;
                return (
                  <div key={i.product_id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-zinc-400">Produto</p>
                        <p className="mt-1 text-lg font-semibold tracking-tight">{i.nome}</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {formatBRL(Number(i.preco))} / unidade
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-zinc-400">Total do item</p>
                        <p className="mt-1 text-lg font-semibold">{formatBRL(lineTotal)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                      {/* quantidade */}
                      <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/30 p-1">
                        <button
                          onClick={() => dec(i.product_id)}
                          className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
                          aria-label="Diminuir"
                        >
                          −
                        </button>
                        <div className="min-w-[70px] text-center text-sm font-semibold">
                          Qtd: {i.qtd}
                        </div>
                        <button
                          onClick={() => inc(i.product_id)}
                          className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5"
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => remove(i.product_id)}
                        className="sm:ml-auto rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/15"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Resumo */}
        <aside className="h-fit rounded-3xl border border-white/10 bg-white/5 p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold tracking-tight">Resumo</h2>
          <p className="mt-1 text-sm text-zinc-400">Confira os valores.</p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">Subtotal</span>
              <span className="font-semibold">{formatBRL(subtotal)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">Frete</span>
              <span className="font-semibold">
                {items.length ? (freteLoading ? "Carregando..." : formatBRL(frete)) : formatBRL(0)}
              </span>
            </div>

            <div className="my-3 border-t border-white/10" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Total</span>
              <span className="text-lg font-semibold">{formatBRL(total)}</span>
            </div>

            <a
              href={items.length ? "/checkout" : "/"}
              className={`mt-3 inline-flex w-full justify-center rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                items.length
                  ? "bg-white text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
                  : "cursor-not-allowed bg-white/10 text-zinc-400"
              }`}
              onClick={(e) => {
                if (!items.length) e.preventDefault();
              }}
            >
              Finalizar compra
            </a>

            <p className="pt-2 text-xs text-zinc-500">
              No checkout você informa o CEP e escolhe o dia disponível.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
