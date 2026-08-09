# Diagnóstico e Evolução da Codebase — Avaliação 2

Documento do Projeto Integrador Oxetech Helpdesk: diagnóstico atualizado após a Avaliação 1, problemas encontrados e plano de evolução.

**Referência de escopo:** `docs/CHECKPOINTS.md`

**Estado herdado da Avaliação 1:** Strategy (prioridade), Facade (`helpdeskFacade`), SRP (funções pequenas por fluxo). Ver `docs/DIAGNOSTICO-AVALIACAO-1.md`.

---

## Resumo executivo

A Avaliação 1 aplicou Strategy, Facade e SRP dentro de `src/routes.ts`, deixando as rotas finas e a lógica organizada em funções pequenas. Mas o Facade **reorganizou responsabilidades sem separá-las fisicamente**: entrada HTTP, regra de negócio e persistência continuam no mesmo arquivo, e em alguns pontos a própria regra de negócio já carrega detalhes de HTTP (como o código de status). Essa é a crítica central desta avaliação: existir um Facade não é o mesmo que ter camadas separadas.

---

## Problemas encontrados

### 1. Tudo em um único módulo

`src/routes.ts` (471 linhas) concentra rotas Express, o objeto `helpdeskFacade`, as regras de prioridade (`priorityRules`) e as funções de persistência (`readDatabase`/`writeDatabase`). Não há fronteira física entre camadas — apenas organização lógica dentro do mesmo arquivo.

### 2. Persistência acoplada direto na regra de negócio

`helpdeskFacade` chama `readDatabase()`/`writeDatabase()` diretamente (`src/routes.ts:313, 366` e outros pontos). Não existe repositório/gateway de dados; trocar a fonte (de JSON para um banco real, por exemplo) exigiria mexer na regra de negócio.

### 3. Regra de negócio carrega detalhe de HTTP

O tipo `FacadeResult` (`src/routes.ts:61`) inclui `status: number`. A camada de regra de negócio já decide o código HTTP (400, 404, 201...), que é responsabilidade da borda de entrada, não da regra de negócio.

### 4. Validação de entrada manual e incompleta

Os handlers confiam no formato de `request.body`/`request.query` sem validação de tipo real — `hasRequiredTicketFields` e `hasRequiredCommentFields` fazem apenas checagens `Boolean(...)`. Campos como `assignedToId` (em `createTicket`) e `authorId` (em `addComment`/`updateTicketStatus`) nunca são checados contra a lista de usuários existente — podem referenciar IDs inexistentes silenciosamente.

### 5. Contrato de erro inconsistente

Erros ora usam `{ message: ... }`, ora `{ error: ... }` (`src/routes.ts:128, 134, 233, 297`). Não há formato único de erro nem tratamento central — `src/server.ts` não possui middleware de erro.

### 6. Ausência de testes automatizados

Só existe roteiro manual (`tests/endpoints.http`, executado via `httpyac`). Não há verificação automática de regressão para regra de prioridade, validação ou persistência.

### 7. Segurança básica pendente (herdado da Avaliação 1)

`password` continua exposta em `listUsers` e em todo enrich de ticket — `enrichTicketListItem`/`enrichTicketDetail` fazem spread do objeto `User` completo, incluindo a senha.

### 8. Persistência frágil (herdado da Avaliação 1)

I/O síncrono sem tratamento de erro de arquivo, sem lock para escrita concorrente, e `generateId` usando `Date.now()` + número aleatório (risco de colisão).

---

## Plano de evolução 

| # | Frente | Status |
|---|--------|--------|
| 1 | Diagnóstico atualizado | Em andamento (este documento) |
| 2 | Separação em camadas (HTTP / regra de negócio / persistência), possivelmente em módulos com dependências claras | Concluído |
| 3 | Melhoria de fluxo relevante — validar `assignedToId` e `authorId` contra usuários existentes | Concluído |
| 4 | Validação de entrada (DTOs/schema) na borda HTTP | Concluído |
| 5 | Tratamento de erros consistente (classes de erro + middleware central) | Concluído |
| 6 | Testes unitários e de integração (Vitest + supertest) | Concluído |
| 7 | Correção de problemas básicos de segurança (exposição de `password`) | Concluído |

---

## Soluções e Decisões Técnicas

### 2. Separação em camadas (controller / service / repository)

| | |
|---|---|
| **Problema** | `src/routes.ts` concentrava rotas Express, regra de negócio (`helpdeskFacade`) e persistência (`readDatabase`/`writeDatabase`) no mesmo arquivo — resolve os problemas 1 e 2 do diagnóstico. |
| **Solução** | Divisão em três módulos por responsabilidade: `src/controllers/helpdesk.controller.ts` (rotas Express, apenas HTTP), `src/services/helpdesk.service.ts` (regra de negócio, `helpdeskService`) e `src/repositories/database.repository.ts` (`readDatabase`, `writeDatabase`, `generateId`). A regra de prioridade (Strategy da Avaliação 1) foi isolada em `src/services/ticket-priority.service.ts`. |
| **Pattern aplicado — Repository** | `src/repositories/database.repository.ts` é uma aplicação do pattern **Repository**: isola o acesso a dados (leitura/escrita do JSON) atrás de uma interface simples (`readDatabase`, `writeDatabase`, `generateId`), escondendo do resto da aplicação como e onde os dados são persistidos. Antes, o service chamava `fs.readFileSync`/`fs.writeFileSync` diretamente; agora só conhece o repository. Trocar a persistência (ex.: para um banco real) exigiria mudar apenas esse módulo, sem tocar em service ou controller. |
| **Dependências entre módulos** | `controller → service → repository`, sentido único. O controller não conhece persistência; o service não conhece Express (sem `Request`/`Response`). |
| **`routes.ts`** | Removido; `src/server.ts` passa a importar o router de `./controllers/helpdesk.controller`. |
| **Comportamento** | Preservado integralmente — apenas reorganização física de código, validado com `npm run typecheck` (sem erros). |

**Decisão registrada — `FacadeResult` mantido como está:**

O tipo `FacadeResult` (agora em `helpdesk.service.ts`) ainda inclui `status: number`, ou seja, o service continua decidindo o código HTTP — o problema 3 do diagnóstico (regra de negócio carregando detalhe de HTTP) **não foi resolvido nesta etapa, de propósito**. A correção fica para o passo 5 (tratamento de erros consistente), quando o service passará a lançar erros de domínio e o controller decidirá o status HTTP. Fazer as duas mudanças juntas aumentaria o risco de quebra numa etapa que era só de reorganização estrutural.

**Enrich como responsabilidade do service:** `enrichTicketListItem`/`enrichTicketDetail` foram tratadas como regra de negócio (decidem o shape da resposta) e ficaram no service, não no controller — consciente de que é uma escolha, não a única correta.

---

### 3. Melhoria de fluxo — validar `assignedToId` e `authorId`

| | |
|---|---|
| **Problema** | Parte do problema 4 do diagnóstico: `createTicket` validava `requesterId`, mas `assignedToId` era aceito sem checagem; `addComment` e `updateTicketStatus` aceitavam `authorId` sem verificar se o usuário existia. Um ticket podia ficar atribuído, ou um comentário assinado, por um `id` inexistente. |
| **Solução** | Generalizado `findRequesterOrFail` para `findUserOrFail(users, id, notFoundMessage)`, reaproveitado nos três pontos: `createTicket` (valida `assignedToId` quando informado — campo opcional, só valida se vier), `addComment` (valida `authorId`, já obrigatório) e `updateTicketStatus` (valida `authorId` quando informado, mesmo comportamento opcional que já existia). |
| **Mensagens** | `"Atendente invalido"` (assignedToId) e `"Autor invalido"` (authorId), seguindo o mesmo padrão de `"Solicitante invalido"` já usado. |
| **Onde** | `src/services/helpdesk.service.ts` — `findUserOrFail`, `createTicket`, `updateTicketStatus`, `addComment`. |
| **Verificação** | `npm run typecheck` sem erros; teste manual com `POST /tickets` (assignedToId inválido → 400 `Atendente invalido`) e `POST /tickets/:id/comments` (authorId inválido → 400 `Autor invalido`), além do fluxo válido continuando a funcionar. |

---

### 4. Validação de entrada (DTOs) na borda HTTP

| | |
|---|---|
| **Problema** | Resto do problema 4 do diagnóstico: checagens no service eram só `Boolean(...)` (campo existe?), sem validar tipo/formato. `description` não-string quebrava `calculatePriority` com 500 não tratado; `status` na query de `listTickets` não era validado contra os valores permitidos. |
| **Decisão** | Sem biblioteca de validação (Zod avaliado e descartado por overkill para o escopo) — validação manual com type guards. Validação concentrada **só na borda HTTP** (controller), já que o service só é chamado pelo controller hoje; validar nos dois lugares seria checagem duplicada sem ganho. |
| **Solução** | Novo módulo `src/controllers/helpdesk.validation.ts` com uma função de validação por rota (`validateCreateTicketBody`, `validateUpdateTicketStatusBody`, `validateAddCommentBody`, `validateListTicketsQuery`), cada uma retornando `ValidationResult<T>` (dado tipado ou erro 400 já formatado). O controller valida antes de chamar o service; o service passou a receber apenas dados já com formato garantido. |
| **Separação de responsabilidade** | Controller valida **formato** (tipo, obrigatoriedade, enum de status). Service continua validando **regra de negócio** que depende do banco (existência de `requesterId`/`assignedToId`/`authorId`, exigência de comentário ao fechar ticket) — por isso `hasRequiredTicketFields`, `requiredFieldsMissingResponse`, `isValidStatus`, `invalidStatusResponse`, `hasRequiredCommentFields`, `missingCommentFieldsResponse` foram removidas do service (ficaram redundantes). |
| **Onde** | `src/controllers/helpdesk.validation.ts` (novo); `src/controllers/helpdesk.controller.ts` (chama a validação antes do service); `src/services/helpdesk.service.ts` (checagens de formato removidas, assinaturas dos métodos atualizadas para tipos já validados). |
| **Verificação** | `npm run typecheck` sem erros; testes manuais: `title` numérico → 400 com mensagem de campo inválido; campo obrigatório ausente → 400; `status` inválido na query (`?status=foo`) → 400 (antes filtrava silenciosamente sem resultado); `status` inválido no PATCH → 400; fluxo válido de criação e listagem continuam funcionando. |

---

### 5. Tratamento de erros consistente (classes de erro + middleware central)

| | |
|---|---|
| **Problema** | Fecha o problema 3 (regra de negócio decidindo status HTTP via `FacadeResult`) e o problema 5 (contrato de erro inconsistente, `{message}` vs `{error}`) do diagnóstico. |
| **Solução** | Novo módulo `src/errors/app-error.ts`: `AppError` (base, com `status` e `details` opcionais), `NotFoundError` (404) e `BadRequestError` (400). `helpdesk.service.ts` e `helpdesk.validation.ts` deixaram de retornar `FacadeResult`/`ValidationResult` e passaram a **lançar** essas exceções; os métodos agora retornam o dado de sucesso diretamente (`Ticket`, `TicketComment`, `User[]`, etc.). |
| **Controller** | Ficou ainda mais fino: cada rota só valida, chama o service e define o status de sucesso (`response.status(200\|201).json(dado)`); não decide mais nada sobre erro. Erros lançados de forma síncrona são encaminhados automaticamente pelo Express para o middleware de erro (não precisou de `try/catch` manual nem de wrapper `asyncHandler`, já que toda a cadeia é síncrona). |
| **Middleware central** | Adicionado em `src/server.ts`, depois das rotas e do handler de 404: se o erro for `AppError`, responde `{ error: mensagem, ...detalhes }` com o status certo; qualquer outro erro cai num 500 genérico (`console.error` + `{ error: "Erro interno do servidor" }`). |
| **Contrato de erro unificado** | Todo erro da API (validação de formato, regra de negócio, 404 de rota inexistente, 500 genérico) responde no mesmo formato `{ error: string, ...detalhes opcionais }` — acaba a mistura `message`/`error` que existia desde a Avaliação 1. |
| **Onde** | `src/errors/app-error.ts` (novo); `src/services/helpdesk.service.ts` e `src/controllers/helpdesk.validation.ts` (retornam dado direto, lançam erro); `src/controllers/helpdesk.controller.ts` (simplificado); `src/server.ts` (middleware de erro + 404 padronizado). |
| **Verificação** | `npm run typecheck` sem erros. Testes manuais: ticket inexistente → 404 `{error, id}`; solicitante inválido → 400 `{error}`; campo obrigatório ausente → 400 `{error, required}`; fechar ticket sem comentário → 400; rota inexistente → 404 `{error}`; fluxo válido de criação (201) e listagem (200) continuam funcionando normalmente. |

---

### 6. Testes unitários e de integração

| | |
|---|---|
| **Problema** | Problema 6 do diagnóstico: nenhuma verificação automática de regressão, só o roteiro manual via `httpyac`. |
| **Escopo (decisão explícita)** | Só as partes/endpoints cruciais, sem cobertura ampla — decisão consciente pra não passar do escopo pedido ("não é esperado cobertura total de testes"). |
| **Ferramenta** | **Vitest** escolhido em vez de Jest: TypeScript nativo (sem `ts-jest`/config de transformador extra), API compatível com Jest. `supertest` para os testes de integração HTTP. |
| **Ajustes estruturais necessários para testar** | (1) `src/server.ts` foi separado: `src/app.ts` agora monta e exporta o Express `app` (sem `listen`); `server.ts` só importa e chama `app.listen(...)`. Permite importar o `app` num teste sem abrir porta real. (2) `src/repositories/database.repository.ts`: o cálculo do caminho do arquivo JSON deixou de ser feito uma vez no carregamento do módulo e passou para dentro de `getDatabasePath()` — permite cada teste apontar `DATA_FILE` para um banco temporário isolado. Nenhum dos dois ajustes muda comportamento em produção. |
| **Testes escritos** | `ticket-priority.service.test.ts` (Strategy de prioridade — 6 casos); `helpdesk.validation.test.ts` (validação de formato — campos ausentes, tipo errado, status inválido); `app.test.ts` (integração via `supertest` contra os endpoints mais usados nesta conversa: criar ticket válido/solicitante inválido, ticket inexistente, fechar sem comentário, listar com filtro de status). Total: 18 testes. |
| **Isolamento** | Os testes de integração usam um arquivo JSON temporário (`os.tmpdir()`), recriado a cada teste via `beforeEach`, e removido no `afterAll` — não tocam em `data/db.json`. |
| **Scripts** | `npm test` agora roda `vitest run`; o roteiro manual antigo foi preservado em `npm run test:manual` (`httpyac`). |
| **Onde** | `src/app.ts` (novo), `src/server.ts` (simplificado), `src/repositories/database.repository.ts` (path lazy), `src/services/ticket-priority.service.test.ts`, `src/controllers/helpdesk.validation.test.ts`, `src/app.test.ts` (novos), `package.json` (scripts e devDependencies). |
| **Verificação** | `npm run typecheck` sem erros; `npm test` → 3 arquivos de teste, 18 testes, todos passando. |

---

### 7. Segurança — remover `password` das respostas

| | |
|---|---|
| **Problema** | Problema 7 do diagnóstico, pendente desde a Avaliação 1: `password` era exposta em `listUsers()` e no enrich de tickets (`enrichTicketListItem`/`enrichTicketDetail` faziam spread do `User` completo em `requester`, `assigned` e `author` dos comentários). |
| **Solução** | Helper `toSafeUser(user)` em `helpdesk.service.ts`, que remove `password` via destructuring (`const { password, ...safeUser } = user`). Aplicado em `listUsers()` e nos três pontos de enrich (`requester`, `assigned`, `author`). Tipo `SafeUser = Omit<User, "password">` usado como retorno. |
| **Onde** | `src/services/helpdesk.service.ts`. |
| **Verificação** | `npm run typecheck` sem erros; 2 testes novos em `app.test.ts` (`GET /api/users` sem `password`; ticket enriquecido sem `password` em `requester`/`assigned`) — suíte completa com 20 testes passando; teste manual confirmando `password` ausente em `GET /api/users` e `GET /api/tickets/:id`. |

---

## Fechamento — Avaliação 2

Todas as 7 frentes do plano foram concluídas:

1. Diagnóstico atualizado
2. Separação em camadas (controller / service / repository) — pattern **Repository** aplicado na camada de persistência
3. Melhoria de fluxo (validação de `assignedToId`/`authorId`)
4. Validação de entrada (DTOs) na borda HTTP
5. Tratamento de erros consistente (classes de erro + middleware central)
6. Testes unitários e de integração (Vitest + supertest, 20 testes)
7. Segurança — remoção de `password` das respostas

O problema 8 (persistência frágil — I/O síncrono, sem lock, `generateId` com risco de colisão) permanece como **limitação conhecida**, documentada e fora do escopo desta avaliação, conforme `docs/CHECKPOINTS.md`.

*Documento fechado para a entrega da Avaliação 2.*
