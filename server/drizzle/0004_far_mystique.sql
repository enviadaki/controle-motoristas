CREATE TABLE "fechamentos_semanais" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_id" integer NOT NULL,
	"semana_inicio" date NOT NULL,
	"semana_fim" date NOT NULL,
	"status" text DEFAULT 'ABERTO' NOT NULL,
	"nota_fiscal_arquivo" text,
	"nota_fiscal_nome_original" text,
	"fechado_por_id" integer,
	"fechado_em" timestamp with time zone,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "descontos" ADD COLUMN "semana_referencia" date;--> statement-breakpoint
ALTER TABLE "fechamentos_semanais" ADD CONSTRAINT "fechamentos_semanais_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamentos_semanais" ADD CONSTRAINT "fechamentos_semanais_fechado_por_id_usuarios_id_fk" FOREIGN KEY ("fechado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fechamentos_base_semana_unique" ON "fechamentos_semanais" USING btree ("base_id","semana_inicio");--> statement-breakpoint
CREATE INDEX "descontos_semana_referencia_idx" ON "descontos" USING btree ("base_id","semana_referencia");