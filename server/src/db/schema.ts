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

export const PERFIS = ["ADMIN", "DESCONTOS", "LIDER", "FINANCEIRO"] as const;
export type Perfil = (typeof PERFIS)[number];
// ADMIN       -> acesso total (Rafael / Alex)
// DESCONTOS   -> lança e gerencia descontos de avaria/extravio (Flávia)
// LIDER       -> lança a operação diária da(s) sua(s) base(s); vê descontos travados
// FINANCEIRO  -> confere fechamentos e consolidado de todas as bases (Miriam / Valnei)

export const OPERACOES = ["AMAZON", "SHOPEE", "LOGGI"] as const;
export type Operacao = (typeof OPERACOES)[number];

export const TIPOS_VEICULO = ["MOTO", "PASSEIO", "UTILITARIO", "VAN", "CAMINHAO"] as const;
export type TipoVeiculo = (typeof TIPOS_VEICULO)[number];

export const STATUS_MOTORISTA = ["ATIVO", "INATIVO", "DESLIGADO"] as const;
export type StatusMotorista = (typeof STATUS_MOTORISTA)[number];

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
// Uma linha = valor de rota para (base, operação, cidade/rota, tipo de veículo)
// dentro de um período de vigência. Cobre os modelos vistos nas planilhas:
//   - SAJ: por cidade/faixa de KM, com média de pacotes e adicional
//   - Filiais: valor de rota fixo por cidade
//   - Parâmetros extras (parada extra, resgate, insucesso) por linha
// O cálculo automático que usa estes valores entra no Passo 1.

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
    valorRotaSemana: dinheiro("valor_rota_semana").notNull(), // seg. a sáb.
    valorRotaDomingo: dinheiro("valor_rota_domingo"), // domingo e feriado
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
