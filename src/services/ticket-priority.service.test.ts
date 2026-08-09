import { describe, expect, it } from "vitest";
import { calculatePriority } from "./ticket-priority.service";

describe("calculatePriority", () => {
  it("retorna urgent para categoria infra", () => {
    expect(calculatePriority("infra", "qualquer coisa")).toBe("urgent");
  });

  it("retorna urgent quando a descricao contem 'urgente'", () => {
    expect(calculatePriority("academico", "preciso disso com urgencia, e urgente")).toBe("urgent");
  });

  it("retorna high para categoria sistemas", () => {
    expect(calculatePriority("sistemas", "descricao curta")).toBe("high");
  });

  it("retorna high quando a descricao passa de 220 caracteres", () => {
    const longDescription = "a".repeat(221);
    expect(calculatePriority("outra", longDescription)).toBe("high");
  });

  it("retorna medium para categoria academico", () => {
    expect(calculatePriority("academico", "descricao curta")).toBe("medium");
  });

  it("retorna low quando nenhuma regra se aplica", () => {
    expect(calculatePriority("outra", "descricao curta")).toBe("low");
  });
});
