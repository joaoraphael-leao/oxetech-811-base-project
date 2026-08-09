# Oxetech Helpdesk API

Esta e uma codebase-base para exercicios de refatoracao incremental. O projeto simula uma API simples de chamados de suporte academico.

O objetivo nao e reconstruir o sistema do zero. O objetivo e entender a aplicacao existente, identificar problemas tecnicos, fazer melhorias pequenas e justificar as decisoes por Pull Request.

## Requisitos

- Node.js 20 ou superior
- npm
- Docker (opcional, para rodar containerizado — ver [Docker](#docker))

## Como rodar

Instale as dependencias:

```bash
npm install
```

Reinicie os dados de exemplo, se necessario:

```bash
npm run seed
```

Execute em modo desenvolvimento:

```bash
npm run dev
```

A API ficara disponivel em `http://localhost:3000/api`.

## Docker

Buildar a imagem (multi-stage: compila o TypeScript e roda com um usuario nao-root):

```bash
docker build -t oxetech-helpdesk .
```

Rodar o container:

```bash
docker run -d --name oxetech-helpdesk -p 3000:3000 oxetech-helpdesk
```

A API fica disponivel em `http://localhost:3000/api`, com os dados de exemplo (`data/db.json`) ja incluidos na imagem. A imagem tem `HEALTHCHECK` configurado em `/api/health`.

Para persistir os dados fora do container (ex.: nao perder o que foi criado a cada `docker run`), monte a pasta `data/` como volume:

```bash
docker run -d --name oxetech-helpdesk -p 3000:3000 -v $(pwd)/data:/app/data oxetech-helpdesk
```

Encerrar o container:

```bash
docker rm -f oxetech-helpdesk
```

## CI

O pipeline (`.github/workflows/ci.yml`) roda a cada Pull Request para `main`, com dois jobs:

- `quality-gates`: `npm ci` → `npm run typecheck` → `npm run build` → `npm run test:coverage` (falha se a cobertura cair abaixo do piso definido em `vitest.config.ts`).
- `docker-image`: builda a imagem Docker, sobe um container real e valida `GET /api/health` antes de encerrar — só roda se `quality-gates` passar.

## Scripts

- `npm run dev`: executa a API em modo desenvolvimento.
- `npm run seed`: recria o arquivo de dados inicial.
- `npm run typecheck`: valida os tipos TypeScript.
- `npm run build`: compila o projeto para `dist`.
- `npm test`: executa a suite de testes automatizados (Vitest + supertest) — unitarios (regra de prioridade, validacao de entrada) e de integracao (endpoints principais da API).
- `npm run test:coverage`: executa a suite com relatorio de cobertura (v8); falha se ficar abaixo do piso configurado em `vitest.config.ts`.
- `npm run test:manual`: roteiro manual de verificacao via `httpyac` (`tests/endpoints.http`), util para explorar a API manualmente.

## Endpoints principais

### Healthcheck

```http
GET /api/health
```

### Listar usuarios

```http
GET /api/users
```

### Listar chamados

```http
GET /api/tickets
GET /api/tickets?status=open
GET /api/tickets?category=infra
GET /api/tickets?search=login
```

### Resumo dos chamados

```http
GET /api/tickets/summary
```

### Detalhar chamado

```http
GET /api/tickets/ticket_001
```

### Criar chamado

```http
POST /api/tickets
Content-Type: application/json

{
  "title": "Nao consigo enviar atividade",
  "description": "O sistema apresenta erro ao anexar o arquivo da atividade.",
  "category": "sistemas",
  "requesterId": "user_ana"
}
```

### Atualizar status

```http
PATCH /api/tickets/ticket_001/status
Content-Type: application/json

{
  "status": "in_progress",
  "authorId": "user_carla",
  "comment": "Chamado em atendimento."
}
```

### Adicionar comentario

```http
POST /api/tickets/ticket_001/comments
Content-Type: application/json

{
  "authorId": "user_carla",
  "message": "Solicitei mais informacoes ao usuario."
}
```

## Jornada de refatoracao

Trabalhe em Pull Requests pequenos e bem explicados.

Em cada PR, registre:

- quais problemas voce encontrou;
- quais melhorias foram feitas;
- quais conceitos do curso foram aplicados;
- como voce verificou que o comportamento continua funcionando;
- quais limitacoes continuam existindo.

Consulte [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md) para entender o escopo esperado de cada entrega.

## Documentacao

- [docs/DIAGNOSTICO-AVALIACAO-1.md](docs/DIAGNOSTICO-AVALIACAO-1.md) — diagnostico e solucoes da Avaliacao 1.
- [docs/DIAGNOSTICO-AVALIACAO-2.md](docs/DIAGNOSTICO-AVALIACAO-2.md) — diagnostico e solucoes da Avaliacao 2.
- [docs/RELATORIO_FINAL.md](docs/RELATORIO_FINAL.md) — relatorio final de evolucao (estado inicial, problemas, melhorias, conceitos aplicados, decisoes, evidencias e limitacoes).