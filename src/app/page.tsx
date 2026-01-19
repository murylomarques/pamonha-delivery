"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Product = { id: number; nome: string; preco: number; image_url: string | null };

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select("id,nome,preco,image_url")
        .eq("ativo", true)
        .order("id", { ascending: true });

      if (!error && data) setProducts(data as Product[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🌽</div>
            <div className="leading-tight">
              <p className="text-xs text-zinc-400">Loja</p>
              <h1 className="text-lg font-semibold tracking-tight">Pamonhas do Pai</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/minha-conta/pedidos"
              className="hidden rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 sm:inline-flex"
            >
              Minha conta
            </a>
            <a
              href="/carrinho"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              🛒 Carrinho
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 sm:p-10">
          <p className="text-sm text-zinc-300">Escolha os produtos e agende a entrega pelo CEP.</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">
            Pamonha fresquinha, do jeitinho certo 😋
          </h2>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href="#produtos"
              className="inline-flex justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              Ver produtos
            </a>
            <a
              href="/carrinho"
              className="inline-flex justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-zinc-100 hover:bg-white/5"
            >
              Ir para o carrinho
            </a>
          </div>
        </section>

        {/* Products */}
        <section id="produtos" className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Produtos</h3>
              <p className="text-sm text-zinc-400">Disponíveis hoje na loja.</p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
              Nenhum produto cadastrado ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto max-w-6xl px-4 text-sm text-zinc-500">
          © {new Date().getFullYear()} Pamonhas do Pai
        </div>
      </footer>
    </div>
  );
}

function ProductCard({ p }: { p: { id: number; nome: string; preco: number; image_url: string | null } }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
      {/* imagem */}
      <div className="aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.image_url || "https://placehold.co/1200x750?text=Pamonha"}
          alt={p.nome}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-400">Produto</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">{p.nome}</p>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold">
          R$ {Number(p.preco).toFixed(2)}
        </div>
      </div>

      <button
        onClick={() => addToCart({ id: p.id, nome: p.nome, preco: p.preco })}
        className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 active:scale-[0.99]"
      >
        Adicionar ao carrinho
      </button>

      <p className="mt-3 text-xs text-zinc-400">
        No checkout você digita o CEP e escolhe o dia disponível na sua cidade.
      </p>
    </div>
  );
}

function addToCart(p: { id: number; nome: string; preco: number }) {
  const raw = localStorage.getItem("cart");
  const cart = raw ? JSON.parse(raw) : [];
  const idx = cart.findIndex((i: any) => i.product_id === p.id);

  if (idx >= 0) cart[idx].qtd += 1;
  else cart.push({ product_id: p.id, nome: p.nome, preco: p.preco, qtd: 1 });

  localStorage.setItem("cart", JSON.stringify(cart));
  alert("Adicionado ao carrinho ✅");
}
