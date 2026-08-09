import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;
const hashPassword = (plainPassword: string): string => bcrypt.hashSync(plainPassword, SALT_ROUNDS);

const initialDatabase = {
  users: [
    {
      id: "user_ana",
      name: "Ana Beatriz",
      email: "ana.aluna@example.com",
      role: "student",
      password: hashPassword("123456"),
    },
    {
      id: "user_bruno",
      name: "Bruno Lima",
      email: "bruno.professor@example.com",
      role: "teacher",
      password: hashPassword("professor123"),
    },
    {
      id: "user_carla",
      name: "Carla Suporte",
      email: "carla.suporte@example.com",
      role: "support",
      password: hashPassword("suporte123"),
    },
  ],
  tickets: [
    {
      id: "ticket_001",
      title: "Nao consigo acessar o ambiente virtual",
      description: "A pagina de login informa erro mesmo com a senha correta.",
      category: "sistemas",
      status: "open",
      priority: "high",
      requesterId: "user_ana",
      assignedToId: "user_carla",
      createdAt: "2026-05-01T10:00:00.000Z",
      updatedAt: "2026-05-01T10:00:00.000Z",
    },
    {
      id: "ticket_002",
      title: "Projetor da sala 204 nao liga",
      description: "O equipamento esta sem imagem e a aula comeca em uma hora. Urgente.",
      category: "infra",
      status: "in_progress",
      priority: "urgent",
      requesterId: "user_bruno",
      assignedToId: "user_carla",
      createdAt: "2026-05-02T08:15:00.000Z",
      updatedAt: "2026-05-02T08:35:00.000Z",
    },
    {
      id: "ticket_003",
      title: "Duvida sobre prazo de atividade",
      description: "Preciso confirmar a data final de entrega do projeto integrador.",
      category: "academico",
      status: "resolved",
      priority: "medium",
      requesterId: "user_ana",
      assignedToId: "user_bruno",
      createdAt: "2026-05-03T14:20:00.000Z",
      updatedAt: "2026-05-04T09:00:00.000Z",
    },
  ],
  comments: [
    {
      id: "comment_001",
      ticketId: "ticket_002",
      authorId: "user_carla",
      message: "Chamado recebido. Vou verificar o equipamento antes da aula.",
      createdAt: "2026-05-02T08:35:00.000Z",
    },
    {
      id: "comment_002",
      ticketId: "ticket_003",
      authorId: "user_bruno",
      message: "O prazo final esta registrado no ambiente virtual da disciplina.",
      createdAt: "2026-05-04T09:00:00.000Z",
    },
  ],
};

const dataFile = process.env.DATA_FILE || "data/db.json";
const databasePath = path.resolve(process.cwd(), dataFile);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.writeFileSync(databasePath, JSON.stringify(initialDatabase, null, 2));

console.log(`Banco de dados reiniciado em ${databasePath}`);