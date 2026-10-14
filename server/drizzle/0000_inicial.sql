CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"usuario_nome" text,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"antes" jsonb,
	"depois" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bases" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"cidade" text,
	"uf" text DEFAULT 'BA',
	"operacoes" text[] DEFAULT ARRAY['AMAZON']::text[] NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bases_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "motoristas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cpf" text,
	"cnpj" text,
	"telefone" text,
	"email" text,
	"placa" text,
	"tipo_veiculo" text,
	"base_id" integer NOT NULL,
	"responsavel_pagamento_id" integer,
	"chave_pix" text,
	"favorecido" text,
	"dados_bancarios" text,
	"id_cortex" text,
	"rota_padrao" text,
	"contrato_assinado" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ATIVO' NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tabela_valores" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_id" integer NOT NULL,
	"operacao" text DEFAULT 'AMAZON' NOT NULL,
	"cidade" text NOT NULL,
	"faixa_km" text,
	"tipo_veiculo" text NOT NULL,
	"valor_rota_semana" numeric(12, 2) NOT NULL,
	"valor_rota_domingo" numeric(12, 2),
	"media_pacotes" integer,
	"valor_adicional" numeric(12, 2),
	"valor_pacote_extra" numeric(12, 2),
	"valor_parada_extra" numeric(12, 2),
	"valor_resgate" numeric(12, 2),
	"valor_desconto_insucesso" numeric(12, 2),
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_bases" (
	"usuario_id" integer NOT NULL,
	"base_id" integer NOT NULL,
	CONSTRAINT "usuario_bases_usuario_id_base_id_pk" PRIMARY KEY("usuario_id","base_id")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_acesso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motoristas" ADD CONSTRAINT "motoristas_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motoristas" ADD CONSTRAINT "motoristas_responsavel_pagamento_id_motoristas_id_fk" FOREIGN KEY ("responsavel_pagamento_id") REFERENCES "public"."motoristas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabela_valores" ADD CONSTRAINT "tabela_valores_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_bases" ADD CONSTRAINT "usuario_bases_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_bases" ADD CONSTRAINT "usuario_bases_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "motoristas_cpf_unique" ON "motoristas" USING btree ("cpf") WHERE "motoristas"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "motoristas_base_idx" ON "motoristas" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "tabela_valores_base_idx" ON "tabela_valores" USING btree ("base_id","operacao");