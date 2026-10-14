CREATE TABLE "descontos" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_id" integer NOT NULL,
	"motorista_id" integer,
	"tipo_responsavel" text DEFAULT 'MOTORISTA' NOT NULL,
	"nome_responsavel" text NOT NULL,
	"tbr" text,
	"node_origem" text,
	"motivo" text NOT NULL,
	"acao" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"parcelas" integer DEFAULT 1 NOT NULL,
	"parcela_atual" integer DEFAULT 1 NOT NULL,
	"periodo_apuracao" text,
	"mes_cobranca" date,
	"origem" text,
	"status" text DEFAULT 'DEVIDO' NOT NULL,
	"observacoes" text,
	"lancado_por_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "descontos" ADD CONSTRAINT "descontos_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descontos" ADD CONSTRAINT "descontos_motorista_id_motoristas_id_fk" FOREIGN KEY ("motorista_id") REFERENCES "public"."motoristas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "descontos" ADD CONSTRAINT "descontos_lancado_por_id_usuarios_id_fk" FOREIGN KEY ("lancado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "descontos_base_idx" ON "descontos" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "descontos_motorista_idx" ON "descontos" USING btree ("motorista_id");