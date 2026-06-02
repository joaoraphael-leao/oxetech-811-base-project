import { Router, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import type {Database, Ticket, TicketComment, TicketPriority, TicketStatus, User,
} from "./types";

const router = Router();
const dataFile = process.env.DATA_FILE || "data/db.json";
const databasePath = path.resolve(process.cwd(), dataFile);

function readDatabase(): Database {
  const content = fs.readFileSync(databasePath, "utf-8");
  return JSON.parse(content) as Database;
}

function writeDatabase(database: Database) {
  fs.writeFileSync(databasePath, JSON.stringify(database, null, 2));
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

const LONG_DESCRIPTION_THRESHOLD = 220;

type PriorityContext = {
  category: string;
  description: string;
};

type PriorityRule = {
  appliesTo: (context: PriorityContext) => boolean;
  priority: TicketPriority;
};

function isUrgentPriority({ category, description }: PriorityContext): boolean {
  return category === "infra" || description.toLowerCase().includes("urgente");
}

function isHighPriority({ category, description }: PriorityContext): boolean {
  return category === "sistemas" || description.length > LONG_DESCRIPTION_THRESHOLD;
}

function isMediumPriority({ category }: PriorityContext): boolean {
  return category === "academico";
}

const priorityRules: PriorityRule[] = [
  { appliesTo: isUrgentPriority, priority: "urgent" },
  { appliesTo: isHighPriority, priority: "high" },
  { appliesTo: isMediumPriority, priority: "medium" },
];

function calculatePriority(category: string, description: string): TicketPriority {
  const context: PriorityContext = { category, description };

  const matchedRule = priorityRules.find((rule) => rule.appliesTo(context));
  return matchedRule?.priority ?? "low";
}

type FacadeResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; body: Record<string, unknown> };

type TicketListItem = ReturnType<typeof enrichTicketListItem>;
type TicketDetail = ReturnType<typeof enrichTicketDetail>;

type TicketsSummary = {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  urgent: number;
};

function enrichTicketListItem(database: Database, ticket: Ticket) {
  const requester = database.users.find((user) => user.id === ticket.requesterId);
  const assigned = database.users.find((user) => user.id === ticket.assignedToId);
  const comments = database.comments.filter((comment) => comment.ticketId === ticket.id);

  return {
    ...ticket,
    requester,
    assigned,
    commentsCount: comments.length,
  };
}

function enrichTicketDetail(database: Database, ticket: Ticket) {
  const requester = database.users.find((user) => user.id === ticket.requesterId);
  const assigned = database.users.find((user) => user.id === ticket.assignedToId);
  const comments = database.comments
    .filter((comment) => comment.ticketId === ticket.id)
    .map((comment) => ({
      ...comment,
      author: database.users.find((user) => user.id === comment.authorId),
    }));

  return { ...ticket, requester, assigned, comments };
}

function sendFacadeResult<T>(response: Response, result: FacadeResult<T>) {
  if (!result.ok) {
    response.status(result.status).json(result.body);
    return;
  }

  response.status(result.status).json(result.data);
}

function validateTicketBodyValid(body: {
  title: string;
  description: string;
  category: string;
  requesterId: string;
  assignedToId?: string;
}): boolean {
  return Boolean(body.title && body.description && body.category && body.requesterId);
}

function requiredFieldsMissingResponse(body: {
  title?: string;
  description?: string;
  category?: string;
  requesterId?: string;
  assignedToId?: string;
}): FacadeResult<Ticket> {
  return { ok: false, status: 400, body: { message: "Campos obrigatorios ausentes", required: ["title", "description", "category", "requesterId"], received: body } };
}

function findUserByIdOrFail(users: User[], id?: string): null | FacadeResult<User> {
  const user = users.find((user) => user.id === id);
  if (!user) {
    return { ok: false, status: 400, body: { message: "Usuario nao encontrado", id } };
  }
  return null;
}

function buildNewTicket(body: {
  title: string;
  description: string;
  category: string;
  requesterId: string;
  assignedToId?: string;
}): Ticket {
  const now = new Date().toISOString();
  return {
    id: generateId("ticket"),
    title: body.title,
    description: body.description,
    category: body.category,
    requesterId: body.requesterId,
    assignedToId: body.assignedToId,
    status: "open",
    priority: calculatePriority(body.category, body.description),
    createdAt: now,
    updatedAt: now,
  };
}

function sucessfulCreatedResponse <T>(data: T): FacadeResult<T> {
  return { ok: true, status: 201, data };
}

const helpdeskFacade = {
  listUsers(): FacadeResult<User[]> {
    const database = readDatabase();
    return { ok: true, status: 200, data: database.users };
  },

  listTickets(query: {
    status?: unknown;
    category?: unknown;
    search?: unknown;
  }): FacadeResult<TicketListItem[]> {
    const database = readDatabase();
    let tickets = database.tickets;

    if (query.status) {
      tickets = tickets.filter((ticket) => ticket.status === query.status);
    }

    if (query.category) {
      tickets = tickets.filter((ticket) => ticket.category === query.category);
    }

    if (query.search) {
      const search = String(query.search).toLowerCase();
      tickets = tickets.filter(
        (ticket) =>
          ticket.title.toLowerCase().includes(search) ||
          ticket.description.toLowerCase().includes(search) ||
          ticket.category.toLowerCase().includes(search),
      );
    }

    const data = tickets.map((ticket) => enrichTicketListItem(database, ticket));
    return { ok: true, status: 200, data };
  },

  getTicketsSummary(): FacadeResult<TicketsSummary> {
    const database = readDatabase();
    const summary: TicketsSummary = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
      urgent: 0,
    };

    for (const ticket of database.tickets) {
      if (ticket.status === "open") summary.open++;
      if (ticket.status === "in_progress") summary.in_progress++;
      if (ticket.status === "resolved") summary.resolved++;
      if (ticket.status === "closed") summary.closed++;
      if (ticket.priority === "urgent") summary.urgent++;
    }

    return { ok: true, status: 200, data: summary };
  },

  getTicketById(id: string): FacadeResult<TicketDetail> {
    const database = readDatabase();
    const ticket = database.tickets.find((item) => item.id === id);

    if (!ticket) {
      return {
        ok: false,
        status: 404,
        body: { error: "Ticket nao encontrado", id },
      };
    }

    return { ok: true, status: 200, data: enrichTicketDetail(database, ticket) };
  },

  createTicket(body: {
    title: string;
    description: string;
    category: string;
    requesterId: string;
    assignedToId?: string;
  }): FacadeResult<Ticket> {
    const database = readDatabase();

    if (!validateTicketBodyValid(body)) {
      return requiredFieldsMissingResponse(body);
    }

    findUserByIdOrFail(database.users, body.requesterId);

    const newTicket: Ticket = buildNewTicket(body);
    
    database.tickets.push(newTicket);
    writeDatabase(database);

    return sucessfulCreatedResponse(newTicket);
  },

  updateTicketStatus(
    id: string,
    body: { status?: TicketStatus; comment?: string; authorId?: string },
  ): FacadeResult<Ticket> {
    const database = readDatabase();
    const ticket = database.tickets.find((item) => item.id === id);
    const newStatus = body.status as TicketStatus;

    if (!ticket) {
      return { ok: false, status: 404, body: { message: "Ticket nao encontrado" } };
    }

    if (!["open", "in_progress", "resolved", "closed"].includes(newStatus)) {
      return {
        ok: false,
        status: 400,
        body: {
          message: "Status invalido",
          allowed: ["open", "in_progress", "resolved", "closed"],
        },
      };
    }

    if (newStatus === "closed" && !body.comment) {
      return {
        ok: false,
        status: 400,
        body: { message: "Informe um comentario para fechar o chamado" },
      };
    }

    ticket.status = newStatus;
    ticket.updatedAt = new Date().toISOString();

    if (body.comment) {
      database.comments.push({
        id: generateId("comment"),
        ticketId: ticket.id,
        authorId: body.authorId || ticket.requesterId,
        message: body.comment,
        createdAt: new Date().toISOString(),
      });
    }

    writeDatabase(database);
    return { ok: true, status: 200, data: ticket };
  },

  addComment(
    id: string,
    body: { message?: string; authorId?: string },
  ): FacadeResult<TicketComment> {
    const database = readDatabase();
    const ticket = database.tickets.find((item) => item.id === id);

    if (!ticket) {
      return { ok: false, status: 404, body: { error: "Ticket nao encontrado" } };
    }

    if (!body.message || !body.authorId) {
      return { ok: false, status: 400, body: { error: "Comentario e autor sao obrigatorios" } };
    }

    const comment: TicketComment = {
      id: generateId("comment"),
      ticketId: ticket.id,
      authorId: body.authorId,
      message: body.message,
      createdAt: new Date().toISOString(),
    };

    database.comments.push(comment);
    ticket.updatedAt = new Date().toISOString();
    writeDatabase(database);

    return { ok: true, status: 201, data: comment };
  },
};

router.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "oxetech-helpdesk" });
});

router.get("/users", (_request, response) => {
  sendFacadeResult(response, helpdeskFacade.listUsers());
});

router.get("/tickets", (request, response) => {
  sendFacadeResult(response, helpdeskFacade.listTickets(request.query));
});

router.get("/tickets/summary", (_request, response) => {
  sendFacadeResult(response, helpdeskFacade.getTicketsSummary());
});

router.get("/tickets/:id", (request, response) => {
  sendFacadeResult(response, helpdeskFacade.getTicketById(request.params.id));
});

router.post("/tickets", (request, response) => {
  sendFacadeResult(response, helpdeskFacade.createTicket(request.body));
});

router.patch("/tickets/:id/status", (request, response) => {
  sendFacadeResult(
    response,
    helpdeskFacade.updateTicketStatus(request.params.id, request.body),
  );
});

router.post("/tickets/:id/comments", (request, response) => {
  sendFacadeResult(response, helpdeskFacade.addComment(request.params.id, request.body));
});

export default router;