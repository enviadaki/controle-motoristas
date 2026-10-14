import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";

type Variante = "primario" | "secundario" | "perigo" | "fantasma";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 disabled:bg-marca-200",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  perigo: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  fantasma: "text-slate-600 hover:bg-slate-100",
};

export function Botao({
  variante = "primario",
  carregando,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || carregando}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Campo({
  rotulo,
  erro,
  dica,
  children,
  className = "",
}: {
  rotulo: string;
  erro?: string | null;
  dica?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{rotulo}</span>
      {children}
      {erro ? (
        <span className="mt-1 block text-xs text-red-600">{erro}</span>
      ) : dica ? (
        <span className="mt-1 block text-xs text-slate-500">{dica}</span>
      ) : null}
    </label>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

const CORES_SELO = {
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  vermelho: "bg-red-50 text-red-700 ring-red-200",
  amarelo: "bg-amber-50 text-amber-800 ring-amber-200",
  azul: "bg-marca-50 text-marca-700 ring-marca-200",
  cinza: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Selo({ cor = "cinza", children }: { cor?: keyof typeof CORES_SELO; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CORES_SELO[cor]}`}>
      {children}
    </span>
  );
}

export function Modal({
  titulo,
  aberto,
  aoFechar,
  children,
  rodape,
  largura = "max-w-2xl",
}: {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className={`w-full ${largura} rounded-lg bg-white shadow-xl`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{rodape}</div>}
      </div>
    </div>
  );
}

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex gap-2">{acoes}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Carregando() {
  return (
    <div className="flex justify-center py-10 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function AvisoErro({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</div>;
}
