CREATE TABLE "valores_motorista" (
	"id" serial PRIMARY KEY NOT NULL,
	"motorista_id" integer NOT NULL,
	"valor_pacote" numeric(12, 2) NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tabela_valores" ALTER COLUMN "valor_rota_semana" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "paradas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "duracao_rota" text;--> statement-breakpoint
ALTER TABLE "tabela_valores" ADD COLUMN "modelo_calculo" text DEFAULT 'ROTA_FIXA' NOT NULL;--> statement-breakpoint
ALTER TABLE "tabela_valores" ADD COLUMN "valor_pacote" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tabela_valores" ADD COLUMN "valor_parada" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tabela_valores" ADD COLUMN "valor_rota_6h" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tabela_valores" ADD COLUMN "valor_rota_8h" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "valores_motorista" ADD CONSTRAINT "valores_motorista_motorista_id_motoristas_id_fk" FOREIGN KEY ("motorista_id") REFERENCES "public"."motoristas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "valores_motorista_motorista_idx" ON "valores_motorista" USING btree ("motorista_id","vigencia_inicio");