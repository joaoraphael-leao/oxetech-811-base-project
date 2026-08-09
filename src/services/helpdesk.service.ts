import type { Database, Ticket, TicketComment, TicketStatus, User } from "../types";
import { generateId, readDatabase, writeDatabase } from "../repositories/database.repository";
import { calculatePriority } from "./ticket-priority.service";
import { BadRequestError, NotFoundError } from "../errors/app-error";

type TicketListItem = ReturnType<typeof enrichTicketListItem>;
type TicketDetail = ReturnType<typeof enrichTicketDetail>;
type SafeUser = Omit<User, "password">;

type TicketsSummary = {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  urgent: number;
};

function toSafeUser(user: User | undefined): SafeUser | undefined {
  if (!user) {
    return undefined;
  }

  const { password, ...safeUser } = user;
  return safeUser;
}

function enrichTicketListItem(database: Database, ticket: Ticket) {
  const requester = toSafeUser(database.users.find((user) => user.id === ticket.requesterId));
  const assigned = toSafeUser(database.users.find((user) => user.id === ticket.assignedToId));
  const comments = database.comments.filter((comment) => comment.ticketId === ticket.id);

  return {
    ...ticket,
    requester,
    assigned,
    commentsCount: comments.length,
  };
}

function enrichTicketDetail(database: Database, ticket: Ticket) {
  const requester = toSafeUser(database.users.find((user) => user.id === ticket.requesterId));
  const assigned = toSafeUser(database.users.find((user) => user.id === ticket.assignedToId));
  const comments = database.comments
    .filter((comment) => comment.ticketId === ticket.id)
    .map((comment) => ({
      ...comment,
      author: toSafeUser(database.users.find((user) => user.id === comment.authorId)),
    }));

  return { ...ticket, requester, assigned, comments };
}

function assertUserExists(users: User[], id: string | undefined, notFoundMessage: string): void {
  const exists = users.some((user) => user.id === id);
  if (!exists) {
    throw new BadRequestError(notFoundMessage);
  }
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

function filterTicketsByStatusAndCategory(
  tickets: Ticket[],
  query: { status?: unknown; category?: unknown },
): Ticket[] {
  let filteredTickets = tickets;

  if (query.status) {
    filteredTickets = filteredTickets.filter((ticket) => ticket.status === query.status);
  }

  if (query.category) {
    filteredTickets = filteredTickets.filter((ticket) => ticket.category === query.category);
  }

  return filteredTickets;
}

function filterTicketsBySearch(tickets: Ticket[], search: string): Ticket[] {
  const normalizedSearch = search.toLowerCase();

  return tickets.filter(
    (ticket) =>
      ticket.title.toLowerCase().includes(normalizedSearch) ||
      ticket.description.toLowerCase().includes(normalizedSearch) ||
      ticket.category.toLowerCase().includes(normalizedSearch),
  );
}

function buildEnrichedTicketList(database: Database, tickets: Ticket[]): TicketListItem[] {
  return tickets.map((ticket) => enrichTicketListItem(database, ticket));
}

function countTicketsByStatus(
  tickets: Ticket[],
): { open: number; in_progress: number; resolved: number; closed: number } {
  const counts = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
  };

  for (const ticket of tickets) {
    if (ticket.status === "open") counts.open++;
    if (ticket.status === "in_progress") counts.in_progress++;
    if (ticket.status === "resolved") counts.resolved++;
    if (ticket.status === "closed") counts.closed++;
  }

  return counts;
}

function countTicketsByPriority(tickets: Ticket[]): number {
  return tickets.filter((ticket) => ticket.priority === "urgent").length;
}

function findTicketById(tickets: Ticket[], id: string): Ticket | undefined {
  return tickets.find((item) => item.id === id);
}

function requiresCommentForClosed(status: TicketStatus, comment?: string): boolean {
  return status === "closed" && !comment;
}

function updateTicketWithStatus(ticket: Ticket, status: TicketStatus): void {
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
}

function addCommentIfProvided(
  database: Database,
  ticket: Ticket,
  comment?: string,
  authorId?: string,
): void {
  if (comment) {
    database.comments.push({
      id: generateId("comment"),
      ticketId: ticket.id,
      authorId: authorId || ticket.requesterId,
      message: comment,
      createdAt: new Date().toISOString(),
    });
  }
}

function buildComment(ticketId: string, message: string, authorId: string): TicketComment {
  return {
    id: generateId("comment"),
    ticketId,
    authorId,
    message,
    createdAt: new Date().toISOString(),
  };
}

export const helpdeskService = {
  listUsers(): SafeUser[] {
    return readDatabase().users.map((user) => toSafeUser(user) as SafeUser);
  },

  listTickets(query: {
    status?: TicketStatus;
    category?: string;
    search?: string;
  }): TicketListItem[] {
    const database = readDatabase();
    let filteredTickets = filterTicketsByStatusAndCategory(database.tickets, query);

    if (query.search) {
      filteredTickets = filterTicketsBySearch(filteredTickets, query.search);
    }

    return buildEnrichedTicketList(database, filteredTickets);
  },

  getTicketsSummary(): TicketsSummary {
    const database = readDatabase();
    const statusCounts = countTicketsByStatus(database.tickets);
    const urgentCount = countTicketsByPriority(database.tickets);

    return { ...statusCounts, urgent: urgentCount };
  },

  getTicketById(id: string): TicketDetail {
    const database = readDatabase();
    const ticket = findTicketById(database.tickets, id);

    if (!ticket) {
      throw new NotFoundError("Ticket nao encontrado", { id });
    }

    return enrichTicketDetail(database, ticket);
  },

  createTicket(body: {
    title: string;
    description: string;
    category: string;
    requesterId: string;
    assignedToId?: string;
  }): Ticket {
    const database = readDatabase();

    assertUserExists(database.users, body.requesterId, "Solicitante invalido");

    if (body.assignedToId) {
      assertUserExists(database.users, body.assignedToId, "Atendente invalido");
    }

    const newTicket = buildNewTicket(body);

    database.tickets.push(newTicket);
    writeDatabase(database);

    return newTicket;
  },

  updateTicketStatus(
    id: string,
    body: { status: TicketStatus; comment?: string; authorId?: string },
  ): Ticket {
    const database = readDatabase();
    const ticket = findTicketById(database.tickets, id);

    if (!ticket) {
      throw new NotFoundError("Ticket nao encontrado");
    }

    if (requiresCommentForClosed(body.status, body.comment)) {
      throw new BadRequestError("Informe um comentario para fechar o chamado");
    }

    if (body.authorId) {
      assertUserExists(database.users, body.authorId, "Autor invalido");
    }

    updateTicketWithStatus(ticket, body.status);
    addCommentIfProvided(database, ticket, body.comment, body.authorId);

    writeDatabase(database);
    return ticket;
  },

  addComment(id: string, body: { message: string; authorId: string }): TicketComment {
    const database = readDatabase();
    const ticket = findTicketById(database.tickets, id);

    if (!ticket) {
      throw new NotFoundError("Ticket nao encontrado");
    }

    assertUserExists(database.users, body.authorId, "Autor invalido");

    const comment = buildComment(ticket.id, body.message, body.authorId);

    database.comments.push(comment);
    ticket.updatedAt = new Date().toISOString();
    writeDatabase(database);

    return comment;
  },
};
