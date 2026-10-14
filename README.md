# Controle de Motoristas — Envia Daki

Sistema para controlar o pagamento dos motoristas (prestadores de serviço) de todas as bases:
lançamento diário da operação pelos líderes, descontos de avaria/extravio travados, fechamento
automático com farol e consolidado para o Financeiro. Substitui as planilhas de pagamento por base.

Domínio previsto: `controle-motoristas.enviadaki.com.br`

## Roteiro

| Passo | Entrega | Situação |
|---|---|---|
| 0 | Base do sistema: login, perfis, bases, motoristas, tabela de valores, usuários, auditoria | ✅ pronto |
| 1 | Lançamento diário de rota pelo líder (substitui a planilha da base), com valor calculado pela tabela | ✅ pronto |
| 2 | Descontos de avaria/extravio lançados pela área de Descontos, travados para o líder, com parcelamento | ✅ pronto (evidência/anexo ainda não) |
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
- Cadastro/edição de motorista: Administrador, Financeiro e Líder (líder não mexe nos dados de pagamento, e o nome exige nome e sobrenome completos).
- Lançamento diário: Administrador, Financeiro e Líder (só das bases dele); a semana fecha sozinha ao virar — líder só edita a semana corrente, Admin/Financeiro corrigem semanas fechadas.
- Descontos de avaria/extravio: só Administrador e Descontos lançam/editam; Líder só visualiza (da própria base); Financeiro só muda o status (Devido/Pago/Contestado/Cancelado) ao conferir.
- Tabela de valores, bases e usuários: só Administrador.
- Usuário desativado perde o acesso na hora (a sessão é validada no banco a cada requisição).
- Toda criação/edição/exclusão e todo login ficam registrados na **Auditoria**, com valores antes/depois.

### Como funciona o cálculo do Passo 1

Modelo "SAJ" (confirmado com o Rafael): o motorista recebe um **valor fixo pela semana** (segunda a
sábado) se rodou pelo menos um dia, mais um valor extra se também rodou no domingo. Pacotes acima da
média inclusa geram adicional por unidade; cada **pacote em insucesso desconta um valor fixo** (não é
"tudo ou nada" por dia — o motorista não perde a rota por não completá-la, perde por pacote não entregue).
Paradas extras e resgates também somam. Tudo isso vem da **tabela de valores**, casando base + tipo de
veículo + rota padrão do motorista (campo "Rota padrão" no cadastro precisa bater com a "Cidade/rota" da
tabela de valores); se não achar (ou achar mais de uma vigente) o sistema avisa em vez de calcular errado.
Isto é só o lado operacional — os descontos de avaria/extravio da Flávia (Passo 2) ainda entram por
fora: hoje o Passo 2 lança e acompanha o status de cada desconto, mas o resumo da semana do Passo 1 não
soma esse valor automaticamente ainda (fica para o fechamento do Passo 3, onde os dois se encontram).

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
