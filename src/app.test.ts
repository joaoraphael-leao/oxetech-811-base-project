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
});

describe("PATCH /api/tickets/:id/status", () => {
  it("retorna 400 ao fechar sem informar comentario", async () => {
    const response = await request(app)
      .patch("/api/tickets/ticket_001/status")
      .send({ status: "closed" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Informe um comentario para fechar o chamado" });
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
