import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "./app";

const testDbPath = path.join(os.tmpdir(), "oxetech-helpdesk-test-db.json");

const seedData = {
  users: [
    { id: "user_ana", name: "Ana", email: "ana@example.com", role: "student", password: "123456" },
    { id: "user_carla", name: "Carla", email: "carla@example.com", role: "support", password: "suporte123" },
  ],
  tickets: [
    {
      id: "ticket_001",
      title: "Ticket existente",
      description: "Descricao do ticket existente",
      category: "infra",
      status: "open",
      priority: "urgent",
      requesterId: "user_ana",
      assignedToId: "user_carla",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  comments: [],
};

beforeEach(() => {
  process.env.DATA_FILE = testDbPath;
  fs.writeFileSync(testDbPath, JSON.stringify(seedData, null, 2));
});

afterAll(() => {
  fs.rmSync(testDbPath, { force: true });
});

describe("POST /api/tickets", () => {
  it("cria um ticket valido e retorna 201", async () => {
    const response = await request(app).post("/api/tickets").send({
      title: "Novo ticket",
      description: "Descricao",
      category: "academico",
      requesterId: "user_ana",
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ title: "Novo ticket", status: "open" });
  });

  it("retorna 400 quando o solicitante nao existe", async () => {
    const response = await request(app).post("/api/tickets").send({
      title: "Novo ticket",
      description: "Descricao",
      category: "academico",
      requesterId: "nao_existe",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Solicitante invalido" });
  });

  it("cria um ticket com assignedToId valido", async () => {
    const response = await request(app).post("/api/tickets").send({
      title: "Novo ticket com atendente",
      description: "Descricao",
      category: "academico",
      requesterId: "user_ana",
      assignedToId: "user_carla",
    });

    expect(response.status).toBe(201);
    expect(response.body.assignedToId).toBe("user_carla");
  });

  it("retorna 400 quando o assignedToId nao existe", async () => {
    const response = await request(app).post("/api/tickets").send({
      title: "Novo ticket",
      description: "Descricao",
      category: "academico",
      requesterId: "user_ana",
      assignedToId: "nao_existe",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Atendente invalido" });
  });
});

describe("GET /api/tickets/:id", () => {
  it("retorna 404 quando o ticket nao existe", async () => {
    const response = await request(app).get("/api/tickets/nao_existe");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Ticket nao encontrado");
  });

  it("retorna o ticket com requester, assigned e comentarios enriquecidos", async () => {
    const response = await request(app).get("/api/tickets/ticket_001");

    expect(response.status).toBe(200);
    expect(response.body.requester.name).toBe("Ana");
    expect(response.body.assigned.name).toBe("Carla");
    expect(response.body.comments).toEqual([]);
  });
});

describe("PATCH /api/tickets/:id/status", () => {
  it("retorna 400 ao fechar sem informar comentario", async () => {
    const response = await request(app)
      .patch("/api/tickets/ticket_001/status")
      .send({ status: "closed" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Informe um comentario para fechar o chamado" });
  });

  it("retorna 404 quando o ticket nao existe", async () => {
    const response = await request(app)
      .patch("/api/tickets/nao_existe/status")
      .send({ status: "in_progress" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Ticket nao encontrado");
  });

  it("retorna 400 quando o authorId informado nao existe", async () => {
    const response = await request(app)
      .patch("/api/tickets/ticket_001/status")
      .send({ status: "in_progress", authorId: "nao_existe" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Autor invalido" });
  });

  it("atualiza o status e registra o comentario informado", async () => {
    const response = await request(app)
      .patch("/api/tickets/ticket_001/status")
      .send({ status: "in_progress", authorId: "user_carla", comment: "Assumindo o chamado." });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("in_progress");

    const detail = await request(app).get("/api/tickets/ticket_001");
    expect(detail.body.comments).toHaveLength(1);
    expect(detail.body.comments[0].message).toBe("Assumindo o chamado.");
  });
});

describe("POST /api/tickets/:id/comments", () => {
  it("retorna 404 quando o ticket nao existe", async () => {
    const response = await request(app)
      .post("/api/tickets/nao_existe/comments")
      .send({ message: "Comentario", authorId: "user_ana" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Ticket nao encontrado");
  });

  it("retorna 400 quando o autor nao existe", async () => {
    const response = await request(app)
      .post("/api/tickets/ticket_001/comments")
      .send({ message: "Comentario", authorId: "nao_existe" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Autor invalido" });
  });

  it("cria o comentario e retorna 201", async () => {
    const response = await request(app)
      .post("/api/tickets/ticket_001/comments")
      .send({ message: "Ja estou verificando.", authorId: "user_carla" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ticketId: "ticket_001", message: "Ja estou verificando." });
  });
});

describe("GET /api/tickets/summary", () => {
  it("retorna as contagens por status e por prioridade urgente", async () => {
    const response = await request(app).get("/api/tickets/summary");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ open: 1, in_progress: 0, resolved: 0, closed: 0, urgent: 1 });
  });
});

describe("GET /api/tickets", () => {
  it("filtra por status valido e retorna 200", async () => {
    const response = await request(app).get("/api/tickets").query({ status: "open" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("ticket_001");
  });

  it("nao inclui a senha do requester/assigned no ticket enriquecido", async () => {
    const response = await request(app).get("/api/tickets");

    expect(response.body[0].requester.password).toBeUndefined();
    expect(response.body[0].assigned.password).toBeUndefined();
  });

  it("filtra por texto livre no title/description/category", async () => {
    const response = await request(app).get("/api/tickets").query({ search: "existente" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("ticket_001");
  });

  it("retorna lista vazia quando a busca nao encontra nada", async () => {
    const response = await request(app).get("/api/tickets").query({ search: "nada-a-ver" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe("GET /api/users", () => {
  it("nao inclui a senha dos usuarios", async () => {
    const response = await request(app).get("/api/users");

    expect(response.status).toBe(200);
    for (const user of response.body) {
      expect(user.password).toBeUndefined();
    }
  });
});
