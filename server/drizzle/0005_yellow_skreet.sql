CREATE TABLE "notas_fiscais_mensais" (
	"id" serial PRIMARY KEY NOT NULL,
	"mes" text NOT NULL,
	"responsavel_id" integer NOT NULL,
	"arquivo" text NOT NULL,
	"nome_original" text NOT NULL,
	"enviado_por_id" integer,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_fiscais_mensais" ADD CONSTRAINT "notas_fiscais_mensais_responsavel_id_motoristas_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."motoristas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais_mensais" ADD CONSTRAINT "notas_fiscais_mensais_enviado_por_id_usuarios_id_fk" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_fiscais_mes_responsavel_unique" ON "notas_fiscais_mensais" USING btree ("mes","responsavel_id");--> statement-breakpoint
ALTER TABLE "fechamentos_semanais" DROP COLUMN "nota_fiscal_arquivo";--> statement-breakpoint
ALTER TABLE "fechamentos_semanais" DROP COLUMN "nota_fiscal_nome_original";