import { describe, expect, it } from "vitest";
import { BadRequestError } from "../errors/app-error";
import {
  validateAddCommentBody,
  validateCreateTicketBody,
  validateUpdateTicketStatusBody,
} from "./helpdesk.validation";

describe("validateCreateTicketBody", () => {
  it("lanca BadRequestError quando falta campo obrigatorio", () => {
    expect(() =>
      validateCreateTicketBody({ description: "d", category: "infra", requesterId: "user_ana" }),
    ).toThrow(BadRequestError);
  });

  it("lanca BadRequestError quando o campo tem tipo errado", () => {
    expect(() =>
      validateCreateTicketBody({
        title: 123,
        description: "d",
        category: "infra",
        requesterId: "user_ana",
      }),
    ).toThrow(BadRequestError);
  });

  it("retorna os dados quando o corpo e valido", () => {
    const result = validateCreateTicketBody({
      title: "t",
      description: "d",
      category: "infra",
      requesterId: "user_ana",
    });

    expect(result).toEqual({
      title: "t",
      description: "d",
      category: "infra",
      requesterId: "user_ana",
      assignedToId: undefined,
    });
  });
});

describe("validateUpdateTicketStatusBody", () => {
  it("lanca BadRequestError para status invalido", () => {
    expect(() => validateUpdateTicketStatusBody({ status: "invalido" })).toThrow(BadRequestError);
  });

  it("aceita um status valido", () => {
    const result = validateUpdateTicketStatusBody({ status: "open" });
    expect(result.status).toBe("open");
  });
});

describe("validateAddCommentBody", () => {
  it("lanca BadRequestError quando faltam message ou authorId", () => {
    expect(() => validateAddCommentBody({ message: "oi" })).toThrow(BadRequestError);
  });

  it("retorna os dados quando o corpo e valido", () => {
    const result = validateAddCommentBody({ message: "oi", authorId: "user_ana" });
    expect(result).toEqual({ message: "oi", authorId: "user_ana" });
  });
});
