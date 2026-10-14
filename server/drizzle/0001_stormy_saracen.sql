CREATE TABLE "lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"motorista_id" integer NOT NULL,
	"base_id" integer NOT NULL,
	"data" date NOT NULL,
	"rodou" boolean DEFAULT true NOT NULL,
	"pacotes_entregues" integer DEFAULT 0 NOT NULL,
	"pacotes_insucesso" integer DEFAULT 0 NOT NULL,
	"paradas_extras" integer DEFAULT 0 NOT NULL,
	"resgates" integer DEFAULT 0 NOT NULL,
	"observacoes" text,
	"lancado_por_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_motorista_id_motoristas_id_fk" FOREIGN KEY ("motorista_id") REFERENCES "public"."motoristas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_lancado_por_id_usuarios_id_fk" FOREIGN KEY ("lancado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_motorista_data_unique" ON "lancamentos" USING btree ("motorista_id","data");--> statement-breakpoint
CREATE INDEX "lancamentos_base_data_idx" ON "lancamentos" USING btree ("base_id","data");