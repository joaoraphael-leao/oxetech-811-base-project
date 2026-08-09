# Relatório Final de Evolução — Projeto Integrador Engenharia de Software Moderna

## 1. Como a aplicação funciona

O projeto é uma API de chamados de suporte acadêmico (Oxetech Helpdesk): alunos e professores abrem chamados (`tickets`), que ficam associados a um solicitante e, opcionalmente, a um atendente. A API calcula automaticamente a prioridade do chamado (`low`/`medium`/`high`/`urgent`) a partir da categoria e do conteúdo da descrição, e o ciclo de vida do chamado é `open` → `in_progress` → `resolved`/`closed`, com comentários registrados por qualquer usuário ao longo do caminho.

Endpoints principais:

- `GET /api/health` — healthcheck
- `GET /api/users` — lista usuários (sem senha na resposta)
- `GET /api/tickets` — lista chamados, com filtro por `status`, `category` e busca por texto (`search`)
- `GET /api/tickets/summary` — contagem de chamados por status e quantidade de urgentes
- `GET /api/tickets/:id` — detalhe do chamado, enriquecido com solicitante, atendente e comentários
- `POST /api/tickets` — cria um chamado
- `PATCH /api/tickets/:id/status` — atualiza o status (exige comentário ao fechar)
- `POST /api/tickets/:id/comments` — adiciona um comentário ao chamado

Persistência em arquivo JSON (`data/db.json`), sem banco de dados — decisão mantida deliberadamente ao longo de toda a evolução (ver seção 6).

## 2. Estado inicial da codebase

A API inicial funcionava, mas concentrava tudo em um único arquivo, `src/routes.ts`: persistência em JSON, validação, regras de negócio e montagem de resposta HTTP viviam nos mesmos handlers Express. Isso produzia code smells clássicos — magic number na regra de prioridade, cadeia de `if/else` para decidir prioridade, duplicação na hora de enriquecer o ticket com dados de usuário, e baixa testabilidade (nenhum teste automatizado existia, só um roteiro manual).

## 3. Principais problemas encontrados

**Diagnosticados na Avaliação 1** (estado bruto da codebase):

1. Responsabilidades misturadas — cada rota lia/gravava o banco, validava entrada e montava JSON no mesmo bloco.
2. Magic number (`220`) na regra de prioridade, sem nome.
3. Regra de prioridade acoplada em uma cadeia de `if/else`.
4. Duplicação da lógica de enriquecimento (`requester`/`assigned`/comentários) entre listagem e detalhe.
5. Validação inconsistente — alguns fluxos validavam usuário existente, outros não; contrato de erro misturava `message` e `error`.
6. Segurança básica ausente — `password` exposta em `GET /users` e em usuários enriquecidos nos tickets.
7. Persistência frágil — I/O síncrono sem tratamento de erro, sem lock de escrita concorrente, geração de ID com `Date.now()` + aleatório (risco de colisão).
8. Nomenclatura genérica (`category` como `string` livre) e strings de domínio espalhadas pelo código.

**Diagnosticados na Avaliação 2** (depois do Facade da AV1, mas ainda sem camadas físicas):

9. Ter um Facade não é o mesmo que ter camadas separadas — entrada HTTP, regra de negócio e persistência continuavam no mesmo arquivo (`src/routes.ts`, 471 linhas).
10. Persistência acoplada direto na regra de negócio — sem repositório/gateway de dados.
11. Regra de negócio decidindo detalhe de HTTP — `FacadeResult` incluía `status: number`.
12. `assignedToId` e `authorId` aceitos sem checar se o usuário referenciado existia.
13. Contrato de erro ainda inconsistente (`message` vs `error`), sem middleware central.

## 4. Melhorias implementadas

**Avaliação 1** — refatorações pequenas e seguras, preservando o comportamento da API:

| Conceito | Solução |
|---|---|
| Clean Code | Constante `LONG_DESCRIPTION_THRESHOLD` no lugar do magic number `220` |
| Strategy | Regras de prioridade em `priorityRules` + funções `is*Priority` |
| Facade | `helpdeskFacade` com um método por caso de uso; rotas finas |
| SRP | Funções pequenas por responsabilidade dentro de cada fluxo do facade |
| DRY | `enrichTicketListItem`, `enrichTicketDetail`, `sendFacadeResult` |

**Avaliação 2** — separação física em camadas e fechamento dos problemas estruturais:

| Frente | Solução |
|---|---|
| Camadas | Divisão em `controllers/` (HTTP), `services/` (regra de negócio) e `repositories/` (persistência) — pattern **Repository** isolando o acesso ao JSON |
| Fluxo de negócio | `assignedToId`/`authorId` validados contra usuários existentes (`findUserOrFail`) |
| Validação de entrada | Módulo dedicado `helpdesk.validation.ts` na borda HTTP, com type guards por rota |
| Tratamento de erro | Classes `AppError`/`NotFoundError`/`BadRequestError` + middleware central em `server.ts`; contrato de erro unificado (`{ error, ...detalhes }`) |
| Testes | Vitest + supertest: 20 testes (prioridade, validação, integração dos endpoints principais) |
| Segurança | `password` removida das respostas (`toSafeUser`) em `listUsers` e no enrich de tickets |

**Projeto Final** — consolidação e fechamento das lacunas restantes:

| Frente | Solução |
|---|---|
| CI | `.github/workflows/ci.yml` com dois jobs: `quality-gates` (checkout → setup-node → `npm ci` → typecheck → build → testes com coverage) e `docker-image` (build da imagem, sobe o container, valida `/api/health`, encerra) |
| Coverage | Gate de cobertura em `vitest.config.ts`, com piso calibrado sobre o real e reajustado depois que a suíte cresceu |
| Testes | 12 testes novos cobrindo os fluxos que ainda não tinham teste: `updateTicketStatus` (ticket inexistente, autor inválido, sucesso), `addComment` (idem), `GET /tickets/:id` (sucesso), `GET /tickets/summary`, busca por texto, `createTicket` com `assignedToId` |
| Docker | `Dockerfile` multi-stage (builder + runner), usuário não-root, `HEALTHCHECK`, `.dockerignore` |
| Segurança | Senhas fixas do `seed.ts` hasheadas com `bcryptjs` (não havia fluxo de login comparando senha — era higiene de dado, risco baixo) |
| Persistência | `generateId` trocado de `Date.now()` + aleatório para `crypto.randomUUID()`, fechando o risco de colisão |
| Correção de bug | `tsc` estava compilando `*.test.ts` para `dist/`, e o Vitest varria esses arquivos compilados no CI, quebrando com `require("vitest")`. Corrigido com `exclude` em `tsconfig.json` e `include` explícito em `vitest.config.ts` |

## 5. Conceitos do curso aplicados

Strategy, Facade, SRP, DRY (Avaliação 1); Repository, tratamento de erros com classes de domínio + middleware central, validação de entrada na borda HTTP, testes unitários e de integração (Avaliação 2); Docker multi-stage e usuário não-root, pipeline de CI com quality gates e gate de coverage (Projeto Final).

## 6. Decisões técnicas tomadas

- **Sem Singleton para acesso ao banco** (AV1): `readDatabase`/`writeDatabase` já centralizam o acesso; um `getInstance()` clássico não traria ganho real num JSON em arquivo sem estado compartilhado em memória.
- **`FacadeResult` mantido com `status: number` até a AV2** (decisão registrada na própria AV2): resolver a separação física de camadas e o detalhe de HTTP na regra de negócio na mesma etapa aumentaria o risco de quebra; a correção ficou para o passo seguinte (classes de erro + middleware).
- **Sem biblioteca de validação (Zod avaliada e descartada)**: overkill para o escopo do curso; validação manual com type guards resolve com a mesma clareza.
- **Sem Postgres/ORM**: a persistência em JSON foi mantida deliberadamente — o pattern Repository já isola essa troca futura sem tocar em service/controller, e trocar de banco agora seria escopo maior do que o pedido ("não é esperada arquitetura complexa").
- **Sem lint no CI**: não é exigência do `CHECKPOINTS.md` do projeto nem da entrega do Projeto Final — só aparece citado na entrega da AV2 da metodologia geral do curso, que o próprio `CHECKPOINTS.md` já flexibiliza. Fica como diferencial possível (seção 9).
- **Threshold de coverage calibrado em duas etapas**: definido primeiro com folga sobre a cobertura real da época (para não travar o CI por causa de branch coverage abaixo do valor-alvo) e reajustado para cima depois que a suíte cresceu de 20 para 32 testes.
- **Persistência frágil resolvida parcialmente**: `generateId` corrigido (risco de colisão fechado); I/O sem `try/catch` e lock de concorrência avaliados e conscientemente não implementados nesta etapa (ver limitações).

## 7. Evidências de funcionamento

- `npm run typecheck` e `npm run build` sem erros.
- `npm test` / `npm run test:coverage`: **32 testes passando** em 3 arquivos (`ticket-priority.service.test.ts`, `helpdesk.validation.test.ts`, `app.test.ts`), coverage de **90,09% statements / 76,92% branches / 94,11% functions / 93,37% lines** — acima do gate configurado (85/70/90/85).
- `docker build` (testado com e sem cache) e `docker run` funcionando: healthcheck respondendo em `/api/health`, `POST /api/tickets` gravando em `data/db.json` sem erro de permissão (`EACCES`), `GET /api/users` confirmado sem `password` na resposta.
- Pipeline de CI verde no GitHub Actions — jobs `quality-gates` e `docker-image` passando, inclusive depois de corrigir o bug de `dist/` compilando arquivos de teste.
- Roteiro manual via `httpyac` (`tests/endpoints.http`, `npm run test:manual`) cobrindo os mesmos fluxos principais, herdado desde a Avaliação 1.

## 8. Limitações conhecidas

- Persistência ainda sem `try/catch` de I/O (erro de leitura/escrita do arquivo cai em 500 genérico, mas não é tratado de forma específica) e sem lock de escrita concorrente — avaliado e mantido assim: o ciclo leitura→escrita é 100% síncrono dentro de cada request, o que reduz bastante o risco prático de corrupção por concorrência no escopo de uso do curso.
- Lint não configurado no pipeline de CI (decisão consciente, ver seção 6).
- Campo `category` ainda é `string` livre, sem enum/validação de valores — identificado desde a Avaliação 1 e não priorizado nas etapas seguintes.
- Cobertura de testes não é total (nem precisa ser, pelo escopo do curso) — os pontos mais fracos remanescentes estão em `app.ts` e nos type guards de validação menos usados.

## 9. Próximos passos possíveis

- Trocar a persistência em JSON por um banco real — o pattern Repository já isola essa troca sem exigir mudança em service/controller.
- Adicionar eslint ao pipeline de CI como quality gate adicional.
- Subir o piso de coverage conforme a suíte de testes continuar crescendo.
- Lock de escrita ou fila simples de persistência, caso a concorrência real venha a se tornar um risco prático.
- Validar/tipar o campo `category` como enum de domínio.
