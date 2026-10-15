ALTER TABLE "descontos" ADD COLUMN "status_parcelamento" text;--> statement-breakpoint
ALTER TABLE "descontos" ADD COLUMN "aprovado_por_id" integer;--> statement-breakpoint
ALTER TABLE "descontos" ADD COLUMN "aprovado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "descontos" ADD COLUMN "motivo_rejeicao_parcelamento" text;--> statement-breakpoint
ALTER TABLE "descontos" ADD CONSTRAINT "descontos_aprovado_por_id_usuarios_id_fk" FOREIGN KEY ("aprovado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "descontos_status_parcelamento_idx" ON "descontos" USING btree ("status_parcelamento");