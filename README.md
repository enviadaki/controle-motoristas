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
| 2 | Descontos de avaria/extravio lançados pela área de Descontos, travados para o líder, com parcelamento | ✅ pronto |
| 3 | Fechamento automático por base com farol (verde = confere / vermelho = pendente) | ✅ pronto |
| 4 | Consolidado do Financeiro (todas as bases, por responsável de pagamento) + nota fiscal mensal, pronto para o dia 10 | ✅ pronto |
| 5 | (futuro) Integração via API com o DB Frete | — |

## Perfis de acesso

| Perfil | Quem | O que faz |
|---|---|---|
| Administrador | Rafael, Alex | Tudo: usuários, bases, tabela de valores, auditoria |
| Descontos | Flávia | Lança e gerencia descontos (Passo 2) |
| Líder de base | Líderes das bases | Lança a operação diária **só das bases vinculadas a ele**; vê descontos sem poder alterar |
| Financeiro | Miriam, Valnei | Confere fechamentos e consolidado; mantém dados de pagamento (PIX, favorecido) dos motoristas |
| CFO | Linsmar | **Único** que autoriza parcelamento de desconto. Ao entrar, cai direto na fila de aprovação |

Regras já aplicadas no servidor (não só na tela):
- Líder só enxerga motoristas, bases e valores das bases vinculadas a ele.
- Cadastro/edição de motorista: Administrador, Financeiro e Líder (líder não mexe nos dados de pagamento, e o nome exige nome e sobrenome completos).
- Lançamento diário: Administrador, Financeiro e Líder (só das bases dele); a semana fecha sozinha ao virar — líder só edita a semana corrente, Admin/Financeiro corrigem semanas fechadas.
- Descontos de avaria/extravio: só Administrador e Descontos lançam/editam; Líder só visualiza (da própria base); Financeiro só muda o status (Devido/Pago/Contestado/Cancelado) ao conferir.
- Parcelamento (desconto com mais de 1x): nasce **pendente**, e só o CFO aprova ou rejeita — nem o Administrador pode (regra pedida explicitamente). Qualquer edição no desconto parcelado (valor, parcelas, motivo) volta o status pra pendente, exige aprovar de novo.
- Fechamento semanal (Passo 3): Administrador, Financeiro e o próprio Líder (só da sua base) fecham a semana — exige só o farol **verde**, sem anexo nenhum (a nota fiscal é mensal, não semanal — ver abaixo). Reabrir uma semana já fechada é só de Administrador e Financeiro (o líder não reabre sozinho).
- Consolidado do Financeiro (Passo 4): só Administrador e Financeiro enxergam todas as bases juntas.
- Nota fiscal mensal (Passo 4): Administrador, Financeiro e Líder anexam — o líder só enxerga/anexa pelos responsáveis da própria base; Descontos e CFO não têm acesso a essa tela.
- Tabela de valores (por rota/cidade), bases e usuários: só Administrador.
- Valor por pacote individual do motorista: Administrador e Financeiro (é dado de pagamento, como o PIX); o Líder só visualiza os da própria base.
- Usuário desativado perde o acesso na hora (a sessão é validada no banco a cada requisição).
- Toda criação/edição/exclusão e todo login ficam registrados na **Auditoria**, com valores antes/depois.

### Como funciona o cálculo do Passo 1

Cada cidade/rota tem a sua forma de pagamento, escolhida na **tabela de valores** (campo "Como é pago"),
que casa base + tipo de veículo + rota padrão do motorista (o campo "Rota padrão" no cadastro precisa
bater com a "Cidade/rota" da tabela). São quatro modelos:

| Modelo | Exemplo | Como calcula | O líder lança |
|---|---|---|---|
| **Rota fixa** | Sede VDC, SAJ | **valor fixo pela semana** (seg.–sáb.) se rodou pelo menos um dia + valor de domingo se rodou no domingo + adicional + pacotes acima da média inclusa × valor do pacote extra | entregues, insucesso, paradas extra, resgates |
| **Por pacote** | Rotas filhas do interior | pacotes entregues × valor por pacote **do dia**: o valor individual do motorista, se ele tiver um vigente; senão, o valor padrão da rota | entregues, insucesso, paradas extra, resgates |
| **Por parada** | — | paradas × valor por parada | paradas, entregues, insucesso, resgates |
| **Rota por duração** | Rotas de 6h ou 8h | cada dia rodado vale o valor da rota de 6h ou de 8h, conforme o líder marcar | duração (6h/8h), entregues, insucesso, paradas extra, resgates |

Em **todos** os modelos: cada **pacote em insucesso desconta um valor fixo** (o motorista não perde a
rota por não completá-la, perde por pacote não entregue), e paradas extras e resgates somam. A tela de
lançamentos mostra pra cada motorista só os campos do modelo da rota dele.

**Valor por pacote individual** (aba "Valor por motorista" da tabela de valores): nas rotas por pacote
cada entregador pode ter o próprio valor. Ele tem vigência — pra mudar o valor de alguém, preencha o fim
da vigência atual e cadastre o novo; o histórico fica guardado e o cálculo usa, dia a dia, o valor que
valia naquele dia (se mudar no meio da semana, o resumo mostra as duas linhas). O sistema não deixa
cadastrar duas vigências sobrepostas pro mesmo motorista.

Se faltar alguma informação pra calcular (motorista sem tabela de valor vigente, mais de uma tabela
vigente, rota por pacote sem valor nenhum, dia de rota 6h/8h sem a duração marcada) o sistema avisa em
vez de calcular errado, e o farol do fechamento fica vermelho até resolver. Isto é só o lado operacional —
os descontos de avaria/extravio da Flávia (Passo 2) entram por fora, e se encontram com ele no
fechamento (Passo 3).

### Como funciona o fechamento do Passo 3

Cada desconto pode apontar uma **semana de referência** (a segunda-feira da semana seg.–dom., mesmo
calendário do Passo 1) — é o que liga o desconto ao fechamento certo. Pra cada base+semana, o sistema
calcula:

- o valor operacional de cada motorista ativo (o mesmo cálculo do Passo 1);
- os descontos daquela semana que já podem ser cobrados: sem parcelamento, ou parcelados e **aprovados**
  pelo CFO (um parcelado **rejeitado** não desconta nada, e um **pendente** ainda não entra na conta);
- o líquido de cada motorista = operacional − descontos aplicáveis (nunca negativo).

O **farol** fica vermelho (pendência) se: algum motorista que rodou não tem tabela de valor vigente
batendo (mesmo aviso do Passo 1), ou se existe desconto parcelado **pendente** de aprovação do CFO
naquela semana — só fica verde quando não sobra nenhuma das duas pendências. Fechar a semana (líder,
Financeiro ou Administrador) exige só o farol verde — **sem anexo nenhum**: o motorista não tira nota por
semana, só do acumulado do mês (ver Passo 4). Reabrir uma semana já fechada é só de Administrador e
Financeiro. O histórico de fechamentos guarda quem fechou e quando.

### Como funciona o consolidado do Passo 4

Junta os fechamentos semanais de **todas as bases** dentro de um mês — uma semana entra no mês em que
cai sua segunda-feira, mesmo que o domingo já seja do mês seguinte — e agrupa o líquido por quem
efetivamente recebe o pagamento: o `responsavelPagamentoId` do motorista (campo do cadastro), ou o
próprio motorista quando não tem um responsável diferente dele. Mostra o que já tiver, mesmo com semana
pendente de fechar — a lista de pendências deixa claro o que ainda falta fechar por base/semana, e esses
valores ficam de fora do total até a semana fechar. Exporta para Excel (planilha "Pagamento" com
PIX/favorecido/dados bancários prontos pra conferir, "Por base" com os totais e "Pendências" quando
houver).

### Nota fiscal mensal (parte do Passo 4)

Diferente do que foi levantado na reunião inicial: o motorista (ou quem recebe por ele) **não** tira
nota por semana — tira **uma nota só por mês**, do valor acumulado, perto do dia 10. Por isso a nota
fiscal não trava o fechamento semanal (Passo 3); ela vive numa tela própria ("Notas fiscais do mês"),
uma linha por (mês, responsável de pagamento), mostrando o acumulado do consolidado ao lado do anexo
(PDF/PNG/JPG). Quem normalmente anexa é o **líder da base** do responsável — ele só vê/anexa pelos
responsáveis da própria base; Administrador e Financeiro também podem (por exemplo se o responsável
atende mais de uma base, ou o líder não conseguiu), vendo todas as bases ou filtrando por uma.

## Design pensado pro líder

Líder de base é quem mais usa o sistema no dia a dia, muitas vezes pelo celular, e nem sempre é íntimo
de informática — por isso a tela dele é diferente da do Administrador: em vez de números de cadastro e
roteiro do projeto, ele cai direto num painel com 4 atalhos grandes ("Lançar hoje", "Ver descontos",
"Fechamento da semana", "Notas fiscais do mês") e um aviso simples de quem ainda falta lançar. As telas de uso diário
(lançamentos, fechamento, descontos) viram cartões empilhados no celular — um por motorista/desconto,
com rótulo sempre visível acima do campo — em vez de tabela com rolagem lateral; no computador continuam
como tabela compacta.

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

Instância **dedicada e nova** (sobe seu próprio Nginx Proxy Manager):

```bash
git clone https://github.com/enviadaki/controle-motoristas.git && cd controle-motoristas
cp .env.example .env && nano .env    # senhas fortes; JWT_SECRET com: openssl rand -hex 32
docker compose up -d --build         # migrations rodam sozinhas ao subir o app
# só na primeira vez: bases iniciais + primeiro administrador
docker compose exec -e ADMIN_NOME="Rafael Bezerra" -e ADMIN_EMAIL=rafael@enviadaki.com.br -e ADMIN_SENHA='senha-forte' app node dist/db/seed.js
```

No Nginx Proxy Manager (porta 81): Proxy Host `controle-motoristas.enviadaki.com.br` → `app` porta `5000`,
com SSL Let's Encrypt e Force SSL. Depois feche a porta 81 no Security Group.

**Reaproveitando um host que já roda outro sistema** (ex.: `romaneio-app-prod`, que já tem um Nginx
Proxy Manager rodando pra outro domínio): não suba o serviço `npm` deste projeto — ele bateria nas
portas 80/443 já ocupadas. Use o override de exemplo:

```bash
git clone https://github.com/enviadaki/controle-motoristas.git && cd controle-motoristas
cp .env.example .env && nano .env
cp docker-compose.override.yml.exemplo docker-compose.override.yml   # publica a API só em 127.0.0.1:5001
docker compose up -d --build app postgres    # sem o "npm"
docker compose exec -e ADMIN_NOME="Rafael Bezerra" -e ADMIN_EMAIL=rafael@enviadaki.com.br -e ADMIN_SENHA='senha-forte' app node dist/db/seed.js
```

Depois, no NPM já existente da instância, crie um Proxy Host novo para `controle-motoristas.enviadaki.com.br`
apontando para `127.0.0.1:5001`, com SSL Let's Encrypt e Force SSL.

Atualizar após um merge na `main`:

```bash
git pull && docker compose up -d --build app
```

Backup manual do banco:

```bash
docker compose exec postgres pg_dump -U controle controle_motoristas | gzip > backup-$(date +%F).sql.gz
```

As notas fiscais mensais anexadas (Passo 4) ficam no volume `uploads-data` (montado em
`/app/uploads`) — não fazem parte do banco, então o backup acima não inclui elas. Backup do volume:

```bash
docker run --rm -v controle-motoristas_uploads-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

## Fluxo de trabalho no código

Mudanças sempre em branch separada com Pull Request para revisão — nunca commit direto na `main`.
