export class ErroApi extends Error {
  constructor(
    message: string,
    public status: number,
    public campo?: string,
    public detalhes: { campo: string; mensagem: string }[] = [],
  ) {
    super(message);
  }
}

export async function api<T = unknown>(caminho: string, opcoes: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${caminho}`, {
    method: opcoes.method ?? "GET",
    credentials: "include",
    headers: opcoes.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !caminho.startsWith("/auth/")) window.dispatchEvent(new Event("sessao-expirada"));
    throw new ErroApi(dados.erro ?? `Erro ${res.status}`, res.status, dados.campo, dados.detalhes ?? []);
  }
  return dados as T;
}

// ---- Tipos compartilhados com a API ----

export type Perfil = "ADMIN" | "DESCONTOS" | "LIDER" | "FINANCEIRO";
export type Operacao = "AMAZON" | "SHOPEE" | "LOGGI";
export type TipoVeiculo = "MOTO" | "PASSEIO" | "UTILITARIO" | "VAN" | "CAMINHAO";
export type StatusMotorista = "ATIVO" | "INATIVO" | "DESLIGADO";
export type TipoResponsavel = "MOTORISTA" | "BASE" | "LIDERANCA" | "PARCEIRO";
export type AcaoDesconto =
  | "COBRAR_ENTREGADOR"
  | "COBRAR_PARCEIRO"
  | "COBRAR_MOTORISTA"
  | "COBRAR_COLABORADOR"
  | "DEBITO_BASE"
  | "COBRAR_LIDERANCA"
  | "CONTESTACAO";
export type StatusDesconto = "DEVIDO" | "PAGO" | "CONTESTADO" | "CANCELADO";

export const PERFIS: Perfil[] = ["ADMIN", "DESCONTOS", "LIDER", "FINANCEIRO"];
export const OPERACOES: Operacao[] = ["AMAZON", "SHOPEE", "LOGGI"];
export const TIPOS_VEICULO: TipoVeiculo[] = ["MOTO", "PASSEIO", "UTILITARIO", "VAN", "CAMINHAO"];
export const STATUS_MOTORISTA: StatusMotorista[] = ["ATIVO", "INATIVO", "DESLIGADO"];
export const TIPOS_RESPONSAVEL: TipoResponsavel[] = ["MOTORISTA", "BASE", "LIDERANCA", "PARCEIRO"];
export const ACOES_DESCONTO: AcaoDesconto[] = [
  "COBRAR_ENTREGADOR",
  "COBRAR_PARCEIRO",
  "COBRAR_MOTORISTA",
  "COBRAR_COLABORADOR",
  "DEBITO_BASE",
  "COBRAR_LIDERANCA",
  "CONTESTACAO",
];
export const STATUS_DESCONTO: StatusDesconto[] = ["DEVIDO", "PAGO", "CONTESTADO", "CANCELADO"];

export const ROTULO_ACAO: Record<AcaoDesconto, string> = {
  COBRAR_ENTREGADOR: "Cobrar do entregador",
  COBRAR_PARCEIRO: "Cobrar do parceiro",
  COBRAR_MOTORISTA: "Cobrar do motorista",
  COBRAR_COLABORADOR: "Cobrar do colaborador",
  DEBITO_BASE: "Débito fica para a base",
  COBRAR_LIDERANCA: "Cobrar da liderança",
  CONTESTACAO: "Em contestação",
};
export const ROTULO_STATUS_DESCONTO: Record<StatusDesconto, string> = {
  DEVIDO: "Devido",
  PAGO: "Pago",
  CONTESTADO: "Contestado",
  CANCELADO: "Cancelado",
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  ADMIN: "Administrador",
  DESCONTOS: "Descontos",
  LIDER: "Líder de base",
  FINANCEIRO: "Financeiro",
};
export const ROTULO_VEICULO: Record<TipoVeiculo, string> = {
  MOTO: "Moto",
  PASSEIO: "Passeio",
  UTILITARIO: "Utilitário",
  VAN: "Van",
  CAMINHAO: "Caminhão",
};

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  baseIds: number[];
}

export interface Base {
  id: number;
  codigo: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  operacoes: Operacao[];
  ativo: boolean;
}

export interface Motorista {
  id: number;
  nome: string;
  cpf: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  placa: string | null;
  tipoVeiculo: TipoVeiculo | null;
  baseId: number;
  baseCodigo: string;
  baseNome: string;
  responsavelPagamentoId: number | null;
  responsavelPagamentoNome: string | null;
  chavePix: string | null;
  favorecido: string | null;
  dadosBancarios: string | null;
  idCortex: string | null;
  rotaPadrao: string | null;
  contratoAssinado: boolean;
  status: StatusMotorista;
  observacoes: string | null;
}

export interface LinhaValor {
  id: number;
  baseId: number;
  baseCodigo: string;
  baseNome: string;
  operacao: Operacao;
  cidade: string;
  faixaKm: string | null;
  tipoVeiculo: TipoVeiculo;
  valorRotaSemana: string;
  valorRotaDomingo: string | null;
  mediaPacotes: number | null;
  valorAdicional: string | null;
  valorPacoteExtra: string | null;
  valorParadaExtra: string | null;
  valorResgate: string | null;
  valorDescontoInsucesso: string | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  observacoes: string | null;
}

export interface UsuarioAdmin extends Usuario {
  ativo: boolean;
  ultimoAcesso: string | null;
}

export interface Lancamento {
  id: number;
  motoristaId: number;
  motoristaNome: string;
  baseId: number;
  baseCodigo: string;
  data: string;
  rodou: boolean;
  pacotesEntregues: number;
  pacotesInsucesso: number;
  paradasExtras: number;
  resgates: number;
  observacoes: string | null;
}

export interface SemanaLancamentos {
  semanaInicio: string;
  semanaFim: string;
  fechada: boolean;
  itens: Lancamento[];
}

export interface ResumoSemana {
  motoristaId: number;
  semanaInicio: string;
  semanaFim: string;
  diasTrabalhados: number;
  trabalhouDomingo: boolean;
  pacotesEntregues: number;
  pacotesInsucesso: number;
  paradasExtras: number;
  resgates: number;
  tabelaValorId: number | null;
  avisoValor: string | null;
  valorRotaSemana: number;
  valorRotaDomingo: number;
  valorAdicional: number;
  valorPacotesExtra: number;
  valorParadasExtra: number;
  valorResgates: number;
  valorDescontoInsucesso: number;
  valorTotal: number;
}

export interface Desconto {
  id: number;
  baseId: number;
  baseCodigo: string;
  motoristaId: number | null;
  motoristaNome: string | null;
  tipoResponsavel: TipoResponsavel;
  nomeResponsavel: string;
  tbr: string | null;
  nodeOrigem: string | null;
  motivo: string;
  acao: AcaoDesconto;
  valor: string;
  parcelas: number;
  parcelaAtual: number;
  periodoApuracao: string | null;
  mesCobranca: string | null;
  origem: string | null;
  status: StatusDesconto;
  observacoes: string | null;
}

export interface RegistroAuditoria {
  id: number;
  usuarioNome: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  createdAt: string;
}
