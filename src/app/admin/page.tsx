export default function AdminHome() {
  const cards = [
    { href: "/admin/produtos", title: "Produtos", desc: "Cadastrar, editar, ativar/desativar.", icon: "🧺" },
    { href: "/admin/roteiro", title: "Roteiro", desc: "Definir dias por cidade.", icon: "🗺️" },
    { href: "/admin/capacidade", title: "Capacidade", desc: "Limites por dia e produto.", icon: "📦" },
    { href: "/admin/config", title: "Config", desc: "Frete e configurações gerais.", icon: "⚙️" },
    { href: "/admin/pedidos", title: "Pedidos", desc: "Acompanhar pedidos e status.", icon: "🧾" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-zinc-400">Escolha uma seção para gerenciar a loja.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <a
            key={c.href}
            href={c.href}
            className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10"
          >
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-xl">
                {c.icon}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold tracking-tight">{c.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{c.desc}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
