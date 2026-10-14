import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AlertTriangle, Building2, ClipboardList, History, Home, KeyRound, LogOut, Menu, Table2, Truck, Users, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ROTULO_PERFIL, type Perfil } from "../lib/api";

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: typeof Home;
  perfis?: Perfil[]; // vazio = todos
  emBreve?: boolean;
}

const MENU: { grupo: string; itens: ItemMenu[] }[] = [
  { grupo: "", itens: [{ para: "/", rotulo: "Início", icone: Home }] },
  {
    grupo: "Operação",
    itens: [
      { para: "/lancamentos", rotulo: "Lançamentos diários", icone: ClipboardList },
      { para: "/descontos", rotulo: "Descontos", icone: AlertTriangle },
    ],
  },
  {
    grupo: "Cadastros",
    itens: [
      { para: "/motoristas", rotulo: "Motoristas", icone: Truck },
      { para: "/tabela-valores", rotulo: "Tabela de valores", icone: Table2 },
      { para: "/bases", rotulo: "Bases", icone: Building2, perfis: ["ADMIN"] },
      { para: "/usuarios", rotulo: "Usuários", icone: Users, perfis: ["ADMIN"] },
    ],
  },
  {
    grupo: "Sistema",
    itens: [
      { para: "/auditoria", rotulo: "Auditoria", icone: History, perfis: ["ADMIN"] },
      { para: "/minha-conta", rotulo: "Minha conta", icone: KeyRound },
    ],
  },
];

export function Layout() {
  const { usuario, sair, tem } = useAuth();
  const [aberto, setAberto] = useState(false);

  const menu = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {MENU.map((g) => {
        const itens = g.itens.filter((i) => !i.perfis || tem(...i.perfis));
        if (!itens.length) return null;
        return (
          <div key={g.grupo || "raiz"}>
            {g.grupo && <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-marca-700/70">{g.grupo}</div>}
            <div className="space-y-0.5">
              {itens.map((i) =>
                i.emBreve ? (
                  <div key={i.para} className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-sm text-slate-400">
                    <i.icone className="h-4 w-4" />
                    {i.rotulo}
                    <span className="ml-auto rounded bg-slate-200/70 px-1.5 text-[10px] font-medium text-slate-500">Passo 1</span>
                  </div>
                ) : (
                  <NavLink
                    key={i.para}
                    to={i.para}
                    end={i.para === "/"}
                    onClick={() => setAberto(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition ${
                        isActive ? "bg-white font-medium text-marca-700 shadow-sm" : "text-slate-700 hover:bg-white/70"
                      }`
                    }
                  >
                    <i.icone className="h-4 w-4" />
                    {i.rotulo}
                  </NavLink>
                ),
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const rodape = (
    <div className="border-t border-marca-100 px-4 py-3">
      <div className="truncate text-sm font-medium">{usuario?.nome}</div>
      <div className="text-xs text-slate-500">{usuario && ROTULO_PERFIL[usuario.perfil]}</div>
      <button onClick={sair} className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-red-600">
        <LogOut className="h-3.5 w-3.5" /> Sair
      </button>
    </div>
  );

  const marca = (
    <div className="flex items-center gap-2 px-4 py-4">
      <img src="/enviadaki-logo.png" alt="Envia Daki" className="h-8 w-auto" />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-marca-700">Controle de</div>
        <div className="text-sm font-semibold text-marca-700">Motoristas</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-marca-100 bg-marca-50 md:flex">
        {marca}
        {menu}
        {rodape}
      </aside>

      {aberto && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setAberto(false)} />
          <aside className="relative flex w-64 flex-col bg-marca-50">
            <button className="absolute right-2 top-3 p-1" onClick={() => setAberto(false)} aria-label="Fechar menu">
              <X className="h-5 w-5" />
            </button>
            {marca}
            {menu}
            {rodape}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 md:hidden">
          <button onClick={() => setAberto(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-marca-700">Controle de Motoristas</span>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
