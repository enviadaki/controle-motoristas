import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Domínios fixos
// ---------------------------------------------------------------------------

export const PERFIS = ["ADMIN", "DESCONTOS", "LIDER", "FINANCEIRO", "CFO"] as const;
export type Perfil = (typeof PERFIS)[number];
// ADMIN       -> acesso total (Rafael / Alex)
// DESCONTOS   -> lança e gerencia descontos de avaria/extravio (Flávia)
// LIDER       -> lança a operação diária da(s) sua(s) base(s); vê descontos travados
// FINANCEIRO  -> confere fechamentos e consolidado de todas as bases (Miriam / Valnei)
// CFO         -> único perfil que autoriza parcelamento de desconto (Linsmar); sem isso, o
//                parcelamento lançado pela Descontos fica pendente e não vale ainda

export const OPERACOES = ["AMAZON", "SHOPEE", "LOGGI"] as const;
export type Operacao = (typeof OPERACOES)[number];

export const TIPOS_VEICULO = ["MOTO", "PASSEIO", "UTILITARIO", "VAN", "CAMINHAO"] as const;
export type TipoVeiculo = (typeof TIPOS_VEICULO)[number];

export const STATUS_MOTORISTA = ["ATIVO", "INATIVO", "DESLIGADO"] as const;
export type StatusMotorista = (typeof STATUS_MOTORISTA)[number];

// Como o motorista é pago numa cidade/rota — cada base/cidade tem a sua regra:
// ROTA_FIXA   -> valor fixo semanal pela rota (+ domingo, pacote extra acima da
//                média, adicional). Ex.: sede VDC, SAJ.
// POR_PACOTE  -> pacotes entregues × valor por pacote. Ex.: rotas filhas do
//                interior. Cada motorista pode ter o próprio valor por pacote
//                (tabela valores_motorista); sem ele, vale o valor da rota.
// POR_PARADA  -> paradas × valor por parada.
// ROTA_HORA   -> valor fixo por dia conforme a duração da rota (6h ou 8h).
export const MODELOS_CALCULO = ["ROTA_FIXA", "POR_PACOTE", "POR_PARADA", "ROTA_HORA"] as const;
export type ModeloCalculo = (typeof MODELOS_CALCULO)[number];

export const DURACOES_ROTA = ["6H", "8H"] as const;
export type DuracaoRota = (typeof DURACOES_ROTA)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const dinheiro = (nome: string) => numeric(nome, { precision: 12, scale: 2 });

// ---------------------------------------------------------------------------
// Bases / filiais
// ---------------------------------------------------------------------------

export const bases = pgTable("bases", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull().unique(), // ex.: VDC, SAJ, ALG
  nome: text("nome").notNull(),
  cidade: text("cidade"),
  uf: text("uf").default("BA"),
  // Operações que a base atende — define quais colunas de desconto/valor
  // aparecem no fechamento (VDC: AMAZON+SHOPEE+LOGGI; filiais: só AMAZON).
  operacoes: text("operacoes").array().notNull().default(sql`ARRAY['AMAZON']::text[]`),
  ativo: boolean("ativo").notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Usuários do sistema e vínculo com bases (líderes)
// ---------------------------------------------------------------------------

export const usuarios = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(), // sempre em minúsculas
  senhaHash: text("senha_hash").notNull(),
  perfil: text("perfil").$type<Perfil>().notNull(),
  ativo: boolean("ativo").notNull().default(true),
  ultimoAcesso: timestamp("ultimo_acesso", { withTimezone: true }),
  ...timestamps,
});

export const usuarioBases = pgTable(
  "usuario_bases",
  {
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    baseId: integer("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.baseId] })],
);

// ---------------------------------------------------------------------------
// Motoristas (prestadores de serviço)
// ---------------------------------------------------------------------------

export const motoristas = pgTable(
  "motoristas",
  {
    id: serial("id").primaryKey(),
    nome: text("nome").notNull(),
    cpf: text("cpf"), // só dígitos
    cnpj: text("cnpj"), // só dígitos
    telefone: text("telefone"),
    email: text("email"),
    placa: text("placa"),
    tipoVeiculo: text("tipo_veiculo").$type<TipoVeiculo>(),
    baseId: integer("base_id")
      .notNull()
      .references(() => bases.id),
    // Quem recebe o pagamento. Nas planilhas é a coluna "RESPONSÁVEL": o
    // motorista (DA) pode rodar sob outro responsável, que emite a nota e
    // recebe por ele. Nulo = o próprio motorista recebe.
    responsavelPagamentoId: integer("responsavel_pagamento_id").references(
      (): AnyPgColumn => motoristas.id,
    ),
    chavePix: text("chave_pix"),
    favorecido: text("favorecido"),
    dadosBancarios: text("dados_bancarios"),
    idCortex: text("id_cortex"),
    rotaPadrao: text("rota_padrao"),
    contratoAssinado: boolean("contrato_assinado").notNull().default(false),
    status: text("status").$type<StatusMotorista>().notNull().default("ATIVO"),
    observacoes: text("observacoes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("motoristas_cpf_unique").on(t.cpf).where(sql`${t.cpf} is not null`),
    index("motoristas_base_idx").on(t.baseId),
  ],
);

// ---------------------------------------------------------------------------
// Tabela de valores (parâmetros de pagamento)
// ---------------------------------------------------------------------------
// Uma linha = regra de pagamento para (base, operação, cidade/rota, tipo de
// veículo) dentro de um período de vigência. O modeloCalculo diz quais campos
// valem (ver MODELOS_CALCULO):
//   - ROTA_FIXA:  valorRotaSemana (obrigatório), valorRotaDomingo, mediaPacotes,
//                 valorPacoteExtra, valorAdicional
//   - POR_PACOTE: valorPacote (padrão da rota; o valor do motorista, se houver,
//                 tem prioridade)
//   - POR_PARADA: valorParada
//   - ROTA_HORA:  valorRota6h / valorRota8h
// Em todos: valorParadaExtra, valorResgate e valorDescontoInsucesso.

export const tabelaValores = pgTable(
  "tabela_valores",
  {
    id: serial("id").primaryKey(),
    baseId: integer("base_id")
      .notNull()
      .references(() => bases.id),
    operacao: text("operacao").$type<Operacao>().notNull().default("AMAZON"),
    cidade: text("cidade").notNull(), // cidade ou nome da rota
    faixaKm: text("faixa_km"), // ex.: "0 - 50"
    tipoVeiculo: text("tipo_veiculo").$type<TipoVeiculo>().notNull(),
    modeloCalculo: text("modelo_calculo").$type<ModeloCalculo>().notNull().default("ROTA_FIXA"),
    valorRotaSemana: dinheiro("valor_rota_semana"), // seg. a sáb. (obrigatório em ROTA_FIXA)
    valorRotaDomingo: dinheiro("valor_rota_domingo"), // domingo e feriado
    valorPacote: dinheiro("valor_pacote"), // POR_PACOTE: valor padrão por pacote entregue
    valorParada: dinheiro("valor_parada"), // POR_PARADA: valor por parada
    valorRota6h: dinheiro("valor_rota_6h"), // ROTA_HORA: rota de 6 horas (por dia)
    valorRota8h: dinheiro("valor_rota_8h"), // ROTA_HORA: rota de 8 horas (por dia)
    mediaPacotes: integer("media_pacotes"), // pacotes inclusos na rota
    valorAdicional: dinheiro("valor_adicional"),
    valorPacoteExtra: dinheiro("valor_pacote_extra"),
    valorParadaExtra: dinheiro("valor_parada_extra"),
    valorResgate: dinheiro("valor_resgate"), // meia rota
    valorDescontoInsucesso: dinheiro("valor_desconto_insucesso"),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"), // nulo = vigente
    observacoes: text("observacoes"),
    ...timestamps,
  },
  (t) => [index("tabela_valores_base_idx").on(t.baseId, t.operacao)],
);

// ---------------------------------------------------------------------------
// Valor por pacote individual do motorista (rotas POR_PACOTE). Nas rotas
// filhas cada entregador negocia o próprio valor por pacote — fica aqui, com
// vigência, pra trocar o valor sem perder o histórico do que ele recebia antes.
// Tem prioridade sobre o valorPacote da tabela de valores da rota.
// ---------------------------------------------------------------------------

export const valoresMotorista = pgTable(
  "valores_motorista",
  {
    id: serial("id").primaryKey(),
    motoristaId: integer("motorista_id")
      .notNull()
      .references(() => motoristas.id),
    valorPacote: dinheiro("valor_pacote").notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"), // nulo = vigente
    observacoes: text("observacoes"),
    ...timestamps,
  },
  (t) => [index("valores_motorista_motorista_idx").on(t.motoristaId, t.vigenciaInicio)],
);

// ---------------------------------------------------------------------------
// Lançamentos diários (Passo 1) — líder registra, por motorista e por dia, o
// que rodou. Uma linha por (motorista, data); o valor da semana é calculado
// a partir daqui + tabela_valores (ver lib/calculo.ts), nunca digitado à mão.
// Quais campos o líder preenche depende do modelo de cálculo da rota do
// motorista (paradas em POR_PARADA, duração 6h/8h em ROTA_HORA etc.); o
// desconto por pacote em insucesso vale em todos os modelos.
// ---------------------------------------------------------------------------

export const lancamentos = pgTable(
  "lancamentos",
  {
    id: serial("id").primaryKey(),
    motoristaId: integer("motorista_id")
      .notNull()
      .references(() => motoristas.id),
    // Guardado junto (não só via motorista) pra manter a trava de líder e o
    // histórico corretos mesmo se o motorista for movido de base depois.
    baseId: integer("base_id")
      .notNull()
      .references(() => bases.id),
    data: date("data").notNull(),
    rodou: boolean("rodou").notNull().default(true), // trabalhou nesse dia?
    pacotesEntregues: integer("pacotes_entregues").notNull().default(0),
    pacotesInsucesso: integer("pacotes_insucesso").notNull().default(0), // gera desconto
    paradasExtras: integer("paradas_extras").notNull().default(0),
    paradas: integer("paradas").notNull().default(0), // total de paradas (rotas POR_PARADA)
    duracaoRota: text("duracao_rota").$type<DuracaoRota>(), // rotas ROTA_HORA: 6H ou 8H
    resgates: integer("resgates").notNull().default(0), // meia rota / resgate
    observacoes: text("observacoes"),
    lancadoPorId: integer("lancado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("lancamentos_motorista_data_unique").on(t.motoristaId, t.data),
    index("lancamentos_base_data_idx").on(t.baseId, t.data),
  ],
);

// ---------------------------------------------------------------------------
// Descontos de avaria/extravio (Passo 2) — lançados pela área de Descontos
// (Flávia), travados para o líder (só visualiza). Baseado na planilha real
// "EXTRAVIO DNR": um pacote (TBR) gera um desconto, com um responsável que
// pode ser um motorista cadastrado, a própria base, a liderança ou um
// parceiro/colaborador ainda sem cadastro — por isso nomeResponsavel (texto
// bruto, sempre preenchido) existe separado de motoristaId (link, quando dá
// pra identificar quem é). Parcelas: Admin/Descontos podem dividir um valor
// alto em mais de uma cobrança (ex.: 3x), cada parcela é uma linha própria.
// ---------------------------------------------------------------------------

export const TIPOS_RESPONSAVEL = ["MOTORISTA", "BASE", "LIDERANCA", "PARCEIRO"] as const;
export type TipoResponsavel = (typeof TIPOS_RESPONSAVEL)[number];

export const ACOES_DESCONTO = [
  "COBRAR_ENTREGADOR",
  "COBRAR_PARCEIRO",
  "COBRAR_MOTORISTA",
  "COBRAR_COLABORADOR",
  "DEBITO_BASE",
  "COBRAR_LIDERANCA",
  "CONTESTACAO",
] as const;
export type AcaoDesconto = (typeof ACOES_DESCONTO)[number];

export const STATUS_DESCONTO = ["DEVIDO", "PAGO", "CONTESTADO", "CANCELADO"] as const;
export type StatusDesconto = (typeof STATUS_DESCONTO)[number];

// Autorização do parcelamento (pedido do Rafael): quando a Descontos marca um
// desconto como parcelado (parcelas > 1), a regra só vale depois que o CFO
// (Linsmar — único perfil que autoriza) aprovar. Null = não é parcelado, não
// precisa de autorização.
export const STATUS_PARCELAMENTO = ["PENDENTE", "APROVADO", "REJEITADO"] as const;
export type StatusParcelamento = (typeof STATUS_PARCELAMENTO)[number];

export const descontos = pgTable(
  "descontos",
  {
    id: serial("id").primaryKey(),
    baseId: integer("base_id")
      .notNull()
      .references(() => bases.id),
    motoristaId: integer("motorista_id").references(() => motoristas.id), // link quando identificado
    tipoResponsavel: text("tipo_responsavel").$type<TipoResponsavel>().notNull().default("MOTORISTA"),
    nomeResponsavel: text("nome_responsavel").notNull(), // nome bruto (planilha/lançamento manual)
    tbr: text("tbr"), // código de rastreio do pacote, quando houver
    nodeOrigem: text("node_origem"), // código do node de origem (ex.: SSR9, PJE1) — nem sempre é a mesma base nossa
    motivo: text("motivo").notNull(),
    acao: text("acao").$type<AcaoDesconto>().notNull(),
    valor: dinheiro("valor").notNull(),
    parcelas: integer("parcelas").notNull().default(1),
    parcelaAtual: integer("parcela_atual").notNull().default(1),
    // Preenchido sozinho (não vem do formulário): null enquanto parcelas=1;
    // PENDENTE assim que parcelas>1 até o CFO decidir.
    statusParcelamento: text("status_parcelamento").$type<StatusParcelamento>(),
    aprovadoPorId: integer("aprovado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    motivoRejeicaoParcelamento: text("motivo_rejeicao_parcelamento"),
    periodoApuracao: text("periodo_apuracao"), // ex.: "SEMANA 35" (texto livre, como vem da planilha)
    mesCobranca: date("mes_cobranca"),
    // Segunda-feira da semana (seg.–dom., mesmo calendário do Passo 1) em que
    // esse desconto deve entrar no fechamento. Opcional — sem isso o desconto
    // fica só registrado, sem puxar pra nenhum fechamento (Passo 3).
    semanaReferencia: date("semana_referencia"),
    origem: text("origem"), // LOST / DNR / BONUS / OUTRO
    status: text("status").$type<StatusDesconto>().notNull().default("DEVIDO"),
    observacoes: text("observacoes"),
    lancadoPorId: integer("lancado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("descontos_base_idx").on(t.baseId),
    index("descontos_motorista_idx").on(t.motoristaId),
    index("descontos_status_parcelamento_idx").on(t.statusParcelamento),
    index("descontos_semana_referencia_idx").on(t.baseId, t.semanaReferencia),
  ],
);

// ---------------------------------------------------------------------------
// Fechamento semanal por base (Passo 3) — reúne o resumo do Passo 1
// (lançamentos) com os descontos aprovados da semana (Passo 2) num farol
// (verde = confere, vermelho = tem pendência). Uma linha por (base, semana);
// farol é calculado na hora (lib/fechamento.ts), não fica guardado — só o
// status final. A nota fiscal NÃO entra aqui: o motorista só tira a nota do
// acumulado 1x por mês, perto do dia 10 — isso fica no Passo 4
// (notasFiscaisMensais, por responsável de pagamento).
// ---------------------------------------------------------------------------

export const STATUS_FECHAMENTO = ["ABERTO", "FECHADO"] as const;
export type StatusFechamento = (typeof STATUS_FECHAMENTO)[number];

export const fechamentosSemanais = pgTable(
  "fechamentos_semanais",
  {
    id: serial("id").primaryKey(),
    baseId: integer("base_id")
      .notNull()
      .references(() => bases.id),
    semanaInicio: date("semana_inicio").notNull(),
    semanaFim: date("semana_fim").notNull(),
    status: text("status").$type<StatusFechamento>().notNull().default("ABERTO"),
    fechadoPorId: integer("fechado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    fechadoEm: timestamp("fechado_em", { withTimezone: true }),
    observacoes: text("observacoes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("fechamentos_base_semana_unique").on(t.baseId, t.semanaInicio)],
);

// ---------------------------------------------------------------------------
// Nota fiscal mensal por responsável de pagamento (Passo 4) — cada motorista
// (ou quem recebe por ele) tira uma nota só, do acumulado do mês, perto do
// dia 10. Uma linha por (mês, responsável); quem anexa normalmente é o
// líder da base do responsável, mas Financeiro/Admin também podem.
// ---------------------------------------------------------------------------

export const notasFiscaisMensais = pgTable(
  "notas_fiscais_mensais",
  {
    id: serial("id").primaryKey(),
    mes: text("mes").notNull(), // "AAAA-MM"
    responsavelId: integer("responsavel_id")
      .notNull()
      .references(() => motoristas.id),
    arquivo: text("arquivo").notNull(), // caminho relativo dentro de UPLOADS_DIR
    nomeOriginal: text("nome_original").notNull(),
    enviadoPorId: integer("enviado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("notas_fiscais_mes_responsavel_unique").on(t.mes, t.responsavelId)],
);

// ---------------------------------------------------------------------------
// Auditoria centralizada — toda alteração relevante grava aqui
// ---------------------------------------------------------------------------

export const auditoria = pgTable(
  "auditoria",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    usuarioNome: text("usuario_nome"),
    acao: text("acao").notNull(), // CRIAR | EDITAR | EXCLUIR | LOGIN ...
    entidade: text("entidade").notNull(),
    entidadeId: text("entidade_id"),
    antes: jsonb("antes"),
    depois: jsonb("depois"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_entidade_idx").on(t.entidade, t.entidadeId)],
);
