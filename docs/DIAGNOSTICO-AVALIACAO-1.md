# Diagnóstico e Evolução da Codebase — Avaliação 1

Documento do Projeto Integrador Oxetech Helpdesk: problemas identificados na codebase inicial, soluções aplicadas e limitações conhecidas.

**Arquivo principal refatorado:** `src/routes.ts` (regra da atividade: alterações no mesmo arquivo).

**Referência de escopo:** `docs/CHECKPOINTS.md`

---

## Resumo executivo

A API inicial funcionava, mas concentrava em `src/routes.ts` persistência em JSON, validação, regras de negócio e montagem de resposta HTTP nos mesmos handlers. Isso gerava code smells clássicos: magic number, cadeia de `if` para prioridade, duplicação no enriquecimento de tickets e baixa testabilidade.

Na Avaliação 1 foram aplicadas refatorações **pequenas e seguras**, preservando o comportamento da API:

| Conceito | Solução |
|----------|---------|
| Clean Code | Constante `LONG_DESCRIPTION_THRESHOLD` no lugar do `220` |
| Pattern Strategy | Regras de prioridade em `priorityRules` + funções `is*Priority` |
| Pattern Facade | `helpdeskFacade` com métodos por caso de uso; rotas finas |
| Principio SRP | Funções pequenas por responsabilidade dentro de cada fluxo do facade |
| DRY | `enrichTicketListItem`, `enrichTicketDetail`, `sendFacadeResult` |

---

## Estado inicial — principais falhas encontradas

1. **Responsabilidades misturadas** — cada rota lia/gravava o banco, validava entrada e montava JSON.
2. **Magic number** — `220` na regra de prioridade `high` sem nome.
3. **Regra de prioridade acoplada** — `calculatePriority` com vários `if/else` encadeados.
4. **Duplicação** — lógica de `requester`/`assigned`/comentários repetida em listagem e detalhe.
5. **Validação inconsistente** — alguns fluxos validavam usuário, outros não; contratos de erro misturavam `message` e `error`.
6. **Segurança básica** — `password` exposto em `GET /users` e em usuários enriquecidos nos tickets.
7. **Persistência frágil** — I/O síncrono, sem tratamento de erro de arquivo, risco de corrupção em escrita concorrente.
8. **Nomenclatura** — campo `category` genérico; strings de domínio espalhadas.
9. **IDs** — geração com `Date.now()` + aleatório, risco de colisão (observação, não erro de tipo).

---

## Problema → solução (núcleo da entrega)

Esta seção amarra cada decisão técnica ao problema que a motivou.

### Magic number (`220`)

| | |
|---|---|
| **Problema** | Em `calculatePriority`, o limite de tamanho da descrição para prioridade `high` aparecia como `description.length > 220`, sem contexto. |
| **Impacto** | Code smell; alteração do limite exige buscar o número no código; leitura difícil. |
| **Solução** | Constante `LONG_DESCRIPTION_THRESHOLD = 220`, usada em `isHighPriority`. |
| **Onde** | `src/routes.ts` — linha da constante e função `isHighPriority`. |

---

### Strategy (cálculo de prioridade)

| | |
|---|---|
| **Problema** | `calculatePriority` concentrava regras diferentes (categoria `infra`, palavra "urgente", categoria `sistemas`, tamanho da descrição, categoria `academico`) em uma única cadeia de `if/else`. |
| **Impacto** | Difícil testar regras isoladas; nova regra exige alterar a função inteira; mistura de critérios no mesmo bloco. |
| **Solução** | Pattern **Strategy** funcional: tipo `PriorityRule` com `appliesTo`, funções nomeadas (`isUrgentPriority`, `isHighPriority`, `isMediumPriority`), array `priorityRules` avaliado em ordem; fallback `low`. |
| **Onde** | `priorityRules`, `calculatePriority`, funções `is*Priority`. |
| **Commit** | `feat: Padrão Strategy para as regras de negócio de prioridade dos tickets.` |

---

### Facade (orquestração dos endpoints)

| | |
|---|---|
| **Problema** | Handlers HTTP faziam tudo: `readDatabase`/`writeDatabase`, validações, regras e montagem de resposta enriquecida no mesmo bloco. |
| **Impacto** | Rotas longas; acoplamento Express ↔ persistência; difícil reutilizar fluxos; violação de SRP na camada de entrada. |
| **Solução** | Pattern **Facade**: objeto `helpdeskFacade` com um método por operação (`listTickets`, `createTicket`, `updateTicketStatus`, etc.). Rotas delegam via `sendFacadeResult`. Endpoint `/health` permaneceu fora do facade (resposta trivial). |
| **Onde** | `helpdeskFacade`, rotas no final de `src/routes.ts`. |
| **Commit** | `feat: aplicação de um facade para todos os endpoints, deixando as rotas limpas. Sem mudança de lógica.` |

**Observação:** o Facade não alterou a lógica de negócio; reorganizou quem chama quem. Comportamento da API mantido.

---

### SRP — Single Responsibility Principle

| | |
|---|---|
| **Problema** | Mesmo após o Facade, métodos como `createTicket` e `listTickets` ainda misturavam validação, filtro, montagem de entidade, persistência e formato de resposta. |
| **Impacto** | Funções longas; uma mudança em validação arrisca afetar persistência; SRP ainda violado dentro do facade. |
| **Solução** | Quebra em funções pequenas, cada uma com uma razão para mudar. O método do facade virou **orquestrador**. |

**Exemplos por fluxo:**

| Fluxo | Funções extraídas (responsabilidade única) |
|-------|---------------------------------------------|
| `createTicket` | `hasRequiredTicketFields`, `requiredFieldsMissingResponse`, `findRequesterOrFail`, `buildNewTicket`, `successfulCreatedResponse` |
| `listTickets` | `filterTicketsByStatusAndCategory`, `filterTicketsBySearch`, `buildEnrichedTicketList`, `successfulOkResponse` |
| `getTicketsSummary` | `countTicketsByStatus`, `countTicketsByPriority` |
| `getTicketById` | `findTicketById`, `ticketNotFoundResponse`, `enrichTicketDetail` |
| `updateTicketStatus` | `isValidStatus`, `invalidStatusResponse`, `requiresCommentForClosed`, `missingCommentForClosedResponse`, `updateTicketWithStatus`, `addCommentIfProvided` |
| `addComment` | `hasRequiredCommentFields`, `missingCommentFieldsResponse`, `buildComment` |

**DRY relacionado:** `enrichTicketListItem` e `enrichTicketDetail` eliminam duplicação da montagem de ticket enriquecido (problema 1.4 do estado inicial).

**Commits (SRP):** série `refactor: quebra de ... em funções de responsabilidade única` + `fix: valida solicitante inexistente...` em `createTicket`.

---

## Outros problemas — status após a refatoração

| Problema | Status | Observação |
|----------|--------|------------|
| Duplicação enrich list/detail | **Resolvido** | `enrichTicketListItem`, `enrichTicketDetail` |
| Solicitante inválido em `createTicket` | **Resolvido** | `findRequesterOrFail` com retorno tratado; mensagem `Solicitante invalido` |
| Validação de status em PATCH | **Melhorado** | `isValidStatus` (type guard) em vez de apenas cast |
| Exposição de `password` | **Pendente** | `listUsers` e enrich ainda retornam `User` completo |
| `category` nome genérico | **Pendente** | Pode ficar para PR futuro |
| `authorId` sem validar existência em comentários | **Pendente** | Comportamento igual ao inicial |
| Contrato de erro (`message` vs `error`) | **Parcial** | Mantido compatível com API original por endpoint |
| Repositório / Singleton para DB | **Não aplicado** | `readDatabase`/`writeDatabase` centralizados; objeto único de repositório considerado overkill neste escopo |
| I/O síncrono, concorrência, `generateId` | **Pendente** | Limitações documentadas abaixo |
| `listUsers` sem helpers SRP | **Opcional** | Fluxo trivial (2 linhas) |

---

## O que não foi feito (e por quê)

Conforme `CHECKPOINTS.md`, **não era esperado** na Avaliação 1:

- Reescrever a aplicação ou criar arquitetura completa
- Novos arquivos de camadas (regra da atividade: mesmo `routes.ts`)
- Cobertura ampla de testes automatizados
- Docker, CI ou deploy

**Singleton** para acesso ao banco **não foi adotado**: `readDatabase`/`writeDatabase` já centralizam o acesso; um `getInstance()` clássico não traria ganho real neste contexto (JSON em arquivo, sem estado compartilhado em memória).

---

## Limitações conhecidas (para o PR)

- Senhas ainda expostas nas respostas de usuário
- Persistência em JSON com leitura/escrita síncrona e sem lock
- Geração de ID com risco de colisão em concorrência
- Campo `category` ainda genérico e tipado como `string`
- Validação de `authorId` em comentários não verifica existência no banco
- `received: body` em erro 400 de criação de ticket (pode vazar dados do body)

---

## Evidências de funcionamento (roteiro manual)

```text
npm run typecheck  → deve passar
npm run build      → recomendado

GET  /api/health
GET  /api/users
GET  /api/tickets
GET  /api/tickets?status=open
GET  /api/tickets?category=infra
GET  /api/tickets?search=urgente
GET  /api/tickets/ticket_001
GET  /api/tickets/summary
POST /api/tickets          (body válido → 201)
POST /api/tickets          (sem title → 400, campos obrigatórios)
POST /api/tickets          (requesterId inválido → 400, Solicitante invalido)
PATCH /api/tickets/ticket_001/status  (status válido → 200)
PATCH /api/tickets/ticket_001/status  (closed sem comment → 400)
POST /api/tickets/ticket_001/comments (message + authorId → 201)
```

Prioridade `urgent`/`high`: testar `POST` com `category: infra` ou descrição contendo "urgente"; `category: sistemas` ou descrição longa (> 220 caracteres).

---

## Histórico de commits relevantes

| Commit (resumo) | Conceito |
|-----------------|----------|
| Strategy para prioridade | Strategy |
| Facade para endpoints | Facade |
| SRP em createTicket, listTickets, summary, getById, updateStatus, addComment | SRP |
| Fix solicitante em createTicket | Correção + SRP |

---

## Arquivos analisados

- `src/routes.ts` (principal)
- `src/types.ts`
- `src/seed.ts`
- `src/server.ts`

---

*Documento atualizado para a entrega da Avaliação 1 — diagnóstico inicial, problemas que motivaram Strategy, Facade, SRP e constante nomeada, e status das melhorias implementadas.*
