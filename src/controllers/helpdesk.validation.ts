import type { TicketStatus } from "../types";
import { BadRequestError } from "../errors/app-error";

export type CreateTicketInput = {
  title: string;
  description: string;
  category: string;
  requesterId: string;
  assignedToId?: string;
};

export type UpdateTicketStatusInput = {
  status: TicketStatus;
  comment?: string;
  authorId?: string;
};

export type AddCommentInput = {
  message: string;
  authorId: string;
};

export type ListTicketsInput = {
  status?: TicketStatus;
  category?: string;
  search?: string;
};

const ALLOWED_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isValidStatus(status: unknown): status is TicketStatus {
  return typeof status === "string" && ALLOWED_STATUSES.includes(status as TicketStatus);
}

function assertPlainObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestError("Corpo da requisicao invalido");
  }
}

export function validateCreateTicketBody(body: unknown): CreateTicketInput {
  assertPlainObject(body);

  const { title, description, category, requesterId, assignedToId } = body;

  const missing: string[] = [];
  if (!isNonEmptyString(title)) missing.push("title");
  if (!isNonEmptyString(description)) missing.push("description");
  if (!isNonEmptyString(category)) missing.push("category");
  if (!isNonEmptyString(requesterId)) missing.push("requesterId");

  if (missing.length > 0) {
    throw new BadRequestError("Campos obrigatorios ausentes ou invalidos", { required: missing });
  }

  if (!isOptionalNonEmptyString(assignedToId)) {
    throw new BadRequestError("assignedToId deve ser uma string");
  }

  return {
    title: title as string,
    description: description as string,
    category: category as string,
    requesterId: requesterId as string,
    assignedToId,
  };
}

export function validateUpdateTicketStatusBody(body: unknown): UpdateTicketStatusInput {
  assertPlainObject(body);

  const { status, comment, authorId } = body;

  if (!isValidStatus(status)) {
    throw new BadRequestError("Status invalido", { allowed: ALLOWED_STATUSES });
  }

  if (!isOptionalNonEmptyString(comment)) {
    throw new BadRequestError("comment deve ser uma string");
  }

  if (!isOptionalNonEmptyString(authorId)) {
    throw new BadRequestError("authorId deve ser uma string");
  }

  return { status, comment, authorId };
}

export function validateAddCommentBody(body: unknown): AddCommentInput {
  assertPlainObject(body);

  const { message, authorId } = body;

  if (!isNonEmptyString(message) || !isNonEmptyString(authorId)) {
    throw new BadRequestError("Comentario e autor sao obrigatorios");
  }

  return { message, authorId };
}

export function validateListTicketsQuery(query: unknown): ListTicketsInput {
  const { status, category, search } = (query ?? {}) as Record<string, unknown>;

  if (status !== undefined && !isValidStatus(status)) {
    throw new BadRequestError("Status invalido para filtro", { allowed: ALLOWED_STATUSES });
  }

  if (!isOptionalNonEmptyString(category) || !isOptionalNonEmptyString(search)) {
    throw new BadRequestError("category e search devem ser strings");
  }

  return { status, category, search };
}
