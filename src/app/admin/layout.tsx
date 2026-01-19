"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "🏠" },
  { href: "/admin/produtos", label: "Produtos", icon: "🧺" },
  { href: "/admin/roteiro", label: "Roteiro", icon: "🗺️" },
  { href: "/admin/entregas", label: "Entregas", icon: "🚚" }, // ✅ NOVO
  { href: "/admin/capacidade", label: "Capacidade", icon: "📦" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "🧾" },
  { href: "/admin/config", label: "Config", icon: "⚙️" },
];

function usePathnameClient() {
  const [p, setP] = useState<string>("");
  useEffect(() => {
    setP(window.location.pathname);
  }, []);
  return p;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathnameClient();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const active = useMemo(() => {
    if (!pathname) return "Admin";

    // se bater exatamente, melhor
    const exact = NAV.find((n) => n.href === pathname)?.label;
    if (exact) return exact;

    // senão, tenta por prefixo (ex: /admin/pedidos/123)
    const prefix = NAV.find((n) => n.href !== "/admin" && pathname.startsWith(n.href));
    return prefix?.label || "Admin";
  }, [pathname]);

  useEffect(() => {
    (async () => {
      // 1) logado?
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }

      // 2) admin?
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (error || profile?.role !== "admin") {
        alert("Sem permissão.");
        window.location.href = "/";
        return;
      }

      setAllowed(true);
      setChecking(false);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (checking || !allowed) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">Carregando admin...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 lg:hidden"
              aria-label="Abrir menu"
            >
              ☰
            </button>

            <a href="/admin" className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🛠️</div>
              <div className="leading-tight">
                <p className="text-xs text-zinc-400">Painel</p>
                <p className="text-base font-semibold tracking-tight">{active}</p>
              </div>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/"
              className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              ← Loja
            </a>

            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar"
          />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-sm border-r border-white/10 bg-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">🛠️</div>
                <div>
                  <p className="text-sm font-semibold">Admin</p>
                  <p className="text-xs text-zinc-400">Navegação</p>
                </div>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
              >
                ✕
              </button>
            </div>

            <nav className="mt-5 space-y-2">
              {NAV.map((item) => {
                const isActive =
                  pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                      isActive
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-white/10 bg-white/0 text-zinc-200 hover:bg-white/5"
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="font-semibold">{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Layout */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar desktop */}
        <aside className="hidden h-fit rounded-3xl border border-white/10 bg-white/5 p-4 lg:block lg:sticky lg:top-24">
          <div className="px-2 pb-2">
            <p className="text-xs text-zinc-400">Menu</p>
          </div>

          <nav className="space-y-2">
            {NAV.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));

              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                    isActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/0 text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="font-semibold">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-white/10 pt-4">
            <a
              href="/"
              className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5"
            >
              ← Voltar pra loja
            </a>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
