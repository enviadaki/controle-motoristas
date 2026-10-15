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

// Envio multipart (upload de arquivo) — usado só pelo fechamento (nota fiscal).
export async function apiUpload<T = unknown>(caminho: string, dados: FormData): Promise<T> {
  const res = await fetch(`/api${caminho}`, { method: "POST", credentials: "include", body: dados });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("sessao-expirada"));
    throw new ErroApi(corpo.erro ?? `Erro ${res.status}`, res.status, corpo.campo, corpo.detalhes ?? []);
  }
  return corpo as T;
}

// ---- Tipos compartilhados com a API ----

export type Perfil = "ADMIN" | "DESCONTOS" | "LIDER" | "FINANCEIRO" | "CFO";
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
export type StatusParcelamento = "PENDENTE" | "APROVADO" | "REJEITADO";

export const PERFIS: Perfil[] = ["ADMIN", "DESCONTOS", "LIDER", "FINANCEIRO", "CFO"];
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
  CFO: "CFO",
};
export const ROTULO_STATUS_PARCELAMENTO: Record<StatusParcelamento, string> = {
  PENDENTE: "Pendente de aprovação",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
};
export type ModeloCalculo = "ROTA_FIXA" | "POR_PACOTE" | "POR_PARADA" | "ROTA_HORA";
export interface ModeloMotorista {
  modelo: ModeloCalculo | null;
  duracoes: number[]; // horas cadastradas (só em ROTA_HORA)
}
export interface DuracaoValor {
  horas: number;
  valor: string;
  valorDomingo: string | null;
}
export const MODELOS_CALCULO: ModeloCalculo[] = ["ROTA_FIXA", "POR_PACOTE", "POR_PARADA", "ROTA_HORA"];
export const ROTULO_MODELO: Record<ModeloCalculo, string> = {
  ROTA_FIXA: "Rota fixa (semana)",
  POR_PACOTE: "Por pacote",
  POR_PARADA: "Por parada",
  ROTA_HORA: "Rota por duração (horas)",
};
export const DICA_MODELO: Record<ModeloCalculo, string> = {
  ROTA_FIXA: "Valor fixo pela semana se rodou; + domingo, pacotes acima da média e adicional.",
  POR_PACOTE: "Pacotes entregues × valor por pacote. O valor individual do motorista (se cadastrado) tem prioridade sobre o da rota.",
  POR_PARADA: "Paradas feitas × valor por parada.",
  ROTA_HORA: "Cada dia rodado vale o valor da duração que o líder marcar (6h, 8h...), mais o complemento, se pedirem uma rota extra no dia.",
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
  modeloCalculo: ModeloCalculo;
  valorRotaSemana: string | null;
  valorRotaDomingo: string | null;
  valorPacote: string | null;
  valorPacoteDomingo: string | null;
  valorParada: string | null;
  valorParadaDomingo: string | null;
  duracoes: DuracaoValor[];
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
  paradas: number;
  horasRota: number | null;
  horasComplemento: number | null;
  resgates: number;
  observacoes: string | null;
}

export interface ValorMotorista {
  id: number;
  motoristaId: number;
  motoristaNome: string;
  baseId: number;
  baseCodigo: string;
  rotaPadrao: string | null;
  valorPacote: string;
  valorPacoteDomingo: string | null;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  observacoes: string | null;
}

export interface ItemProducao {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  total: number;
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
  modeloCalculo: ModeloCalculo | null;
  diasTrabalhados: number;
  trabalhouDomingo: boolean;
  pacotesEntregues: number;
  pacotesInsucesso: number;
  paradas: number;
  paradasExtras: number;
  resgates: number;
  tabelaValorId: number | null;
  avisoValor: string | null;
  valorRotaSemana: number;
  valorRotaDomingo: number;
  valorAdicional: number;
  valorPacotesExtra: number;
  itensProducao: ItemProducao[];
  valorProducao: number;
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
  statusParcelamento: StatusParcelamento | null;
  aprovadoPorNome: string | null;
  aprovadoEm: string | null;
  motivoRejeicaoParcelamento: string | null;
  periodoApuracao: string | null;
  mesCobranca: string | null;
  semanaReferencia: string | null;
  origem: string | null;
  status: StatusDesconto;
  observacoes: string | null;
}

// ---- Passo 3: fechamento semanal com farol ----

export type StatusFechamento = "ABERTO" | "FECHADO";

export interface LinhaFecho {
  motoristaId: number;
  motoristaNome: string;
  resumo: ResumoSemana;
  descontosAplicados: number;
  totalLiquido: number;
  temPendenciaValor: boolean;
}

export interface RegistroFechamento {
  id: number;
  baseId: number;
  semanaInicio: string;
  semanaFim: string;
  status: StatusFechamento;
  fechadoPorId: number | null;
  fechadoEm: string | null;
  observacoes: string | null;
}

export interface ResumoFechamento {
  baseId: number;
  semanaInicio: string;
  semanaFim: string;
  linhas: LinhaFecho[];
  totalOperacional: number;
  totalDescontos: number;
  totalLiquido: number;
  descontosPendentes: number;
  farolVerde: boolean;
  fechamento: RegistroFechamento | null;
}

// ---- Passo 4: consolidado do Financeiro ----

export interface MotoristaConsolidado {
  motoristaId: number;
  motoristaNome: string;
  baseId: number;
  baseCodigo: string;
  totalLiquido: number;
}

export interface ResponsavelConsolidado {
  responsavelId: number;
  responsavelNome: string;
  chavePix: string | null;
  favorecido: string | null;
  dadosBancarios: string | null;
  motoristas: MotoristaConsolidado[];
  totalLiquido: number;
}

export interface BaseConsolidado {
  baseId: number;
  baseCodigo: string;
  totalLiquido: number;
}

export interface PendenciaConsolidado {
  baseId: number;
  baseCodigo: string;
  semanaInicio: string;
  semanaFim: string;
  motivo: string;
}

export interface Consolidado {
  mes: string;
  semanas: string[];
  responsaveis: ResponsavelConsolidado[];
  porBase: BaseConsolidado[];
  totalGeral: number;
  pendencias: PendenciaConsolidado[];
}

// ---- Notas fiscais mensais (anexo do acumulado, 1x por mês perto do dia 10) ----

export interface NotaFiscalMensal {
  id: number;
  responsavelId: number;
  nomeOriginal: string;
  enviadoEm: string;
  enviadoPorNome: string | null;
}

export interface ResponsavelNotaFiscal {
  responsavelId: number;
  responsavelNome: string;
  totalLiquido: number;
  nota: NotaFiscalMensal | null;
}

export interface NotasFiscaisMes {
  mes: string;
  responsaveis: ResponsavelNotaFiscal[];
}

export interface FechamentoHistorico {
  id: number;
  baseId: number;
  baseCodigo: string;
  semanaInicio: string;
  semanaFim: string;
  status: StatusFechamento;
  fechadoPorNome: string | null;
  fechadoEm: string | null;
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
