# Controle de Motoristas — Envia Daki

Sistema para controlar o pagamento dos motoristas (prestadores de serviço) de todas as bases:
lançamento diário da operação pelos líderes, descontos de avaria/extravio travados, fechamento
automático com farol e consolidado para o Financeiro. Substitui as planilhas de pagamento por base.

Domínio previsto: `controle-motoristas.enviadaki.com.br`

## Roteiro

| Passo | Entrega | Situação |
|---|---|---|
| 0 | Base do sistema: login, perfis, bases, motoristas, tabela de valores, usuários, auditoria | ✅ pronto |
| 1 | Lançamento diário de rota pelo líder (substitui a planilha da base), com valor calculado pela tabela | — |
| 2 | Descontos de avaria/extravio lançados pela área de Descontos, travados para o líder, com evidência e parcelamento | — |
| 3 | Fechamento automático por base com farol (verde = confere / vermelho = pendente) + nota fiscal anexada | — |
| 4 | Consolidado do Financeiro (todas as bases, por responsável de pagamento, pronto para o dia 10) | — |
| 5 | (futuro) Integração via API com o DB Frete | — |

## Perfis de acesso

| Perfil | Quem | O que faz |
|---|---|---|
| Administrador | Rafael, Alex | Tudo: usuários, bases, tabela de valores, auditoria |
| Descontos | Flávia | Lança e gerencia descontos (Passo 2) |
| Líder de base | Líderes das bases | Lança a operação diária **só das bases vinculadas a ele**; vê descontos sem poder alterar |
| Financeiro | Miriam, Valnei | Confere fechamentos e consolidado; mantém dados de pagamento (PIX, favorecido) dos motoristas |

Regras já aplicadas no servidor (não só na tela):
- Líder só enxerga motoristas, bases e valores das bases vinculadas a ele.
- Cadastro/edição de motorista: só Administrador e Financeiro (protege PIX e favorecido).
- Tabela de valores, bases e usuários: só Administrador.
- Usuário desativado perde o acesso na hora (a sessão é validada no banco a cada requisição).
- Toda criação/edição/exclusão e todo login ficam registrados na **Auditoria**, com valores antes/depois.

## Stack

Mesma do Sistema de Romaneios: Node.js 22 + TypeScript, Express 5, PostgreSQL 16 + Drizzle ORM,
React 19 + Vite + Tailwind. Monorepo pnpm com `server/` e `client/`.

## Rodar em desenvolvimento

```bash
pnpm install
cp .env.example .env            # preencha; para dev use DATABASE_URL apontando para um Postgres local
pnpm db:migrate                 # cria as tabelas
pnpm db:seed                    # cria as bases iniciais e o primeiro administrador (ADMIN_EMAIL/ADMIN_SENHA)
pnpm --filter ./server dev      # API em http://localhost:5000
pnpm --filter ./client dev      # tela em http://localhost:5173 (encaminha /api para a 5000)
```

Mudou o `server/src/db/schema.ts`? Gere a migration e versione o arquivo gerado em `server/drizzle/`:

```bash
DATABASE_URL=... pnpm db:generate
```

## Produção (EC2, mesmo procedimento das outras instâncias)

```bash
git clone https://github.com/enviadaki/controle-motoristas.git && cd controle-motoristas
cp .env.example .env && nano .env    # senhas fortes; JWT_SECRET com: openssl rand -hex 32
docker compose up -d --build         # migrations rodam sozinhas ao subir o app
# só na primeira vez: bases iniciais + primeiro administrador
docker compose exec -e ADMIN_NOME="Rafael Bezerra" -e ADMIN_EMAIL=rafael@enviadaki.com.br -e ADMIN_SENHA='senha-forte' app node dist/db/seed.js
```

No Nginx Proxy Manager (porta 81): Proxy Host `controle-motoristas.enviadaki.com.br` → `app` porta `5000`,
com SSL Let's Encrypt e Force SSL. Depois feche a porta 81 no Security Group.

Atualizar após um merge na `main`:

```bash
git pull && docker compose up -d --build app
```

Backup manual do banco:

```bash
docker compose exec postgres pg_dump -U controle controle_motoristas | gzip > backup-$(date +%F).sql.gz
```

## Fluxo de trabalho no código

Mudanças sempre em branch separada com Pull Request para revisão — nunca commit direto na `main`.
