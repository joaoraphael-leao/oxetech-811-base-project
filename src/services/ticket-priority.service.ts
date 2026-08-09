import type { TicketPriority } from "../types";

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

export function calculatePriority(category: string, description: string): TicketPriority {
  const context: PriorityContext = { category, description };

  const matchedRule = priorityRules.find((rule) => rule.appliesTo(context));
  return matchedRule?.priority ?? "low";
}
