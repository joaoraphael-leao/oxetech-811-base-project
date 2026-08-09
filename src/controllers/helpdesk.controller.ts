import { Router } from "express";
import { helpdeskService } from "../services/helpdesk.service";
import {
  validateAddCommentBody,
  validateCreateTicketBody,
  validateListTicketsQuery,
  validateUpdateTicketStatusBody,
} from "./helpdesk.validation";

const router = Router();

router.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "oxetech-helpdesk" });
});

router.get("/users", (_request, response) => {
  response.status(200).json(helpdeskService.listUsers());
});

router.get("/tickets", (request, response) => {
  const query = validateListTicketsQuery(request.query);
  response.status(200).json(helpdeskService.listTickets(query));
});

router.get("/tickets/summary", (_request, response) => {
  response.status(200).json(helpdeskService.getTicketsSummary());
});

router.get("/tickets/:id", (request, response) => {
  response.status(200).json(helpdeskService.getTicketById(request.params.id));
});

router.post("/tickets", (request, response) => {
  const body = validateCreateTicketBody(request.body);
  response.status(201).json(helpdeskService.createTicket(body));
});

router.patch("/tickets/:id/status", (request, response) => {
  const body = validateUpdateTicketStatusBody(request.body);
  response.status(200).json(helpdeskService.updateTicketStatus(request.params.id, body));
});

router.post("/tickets/:id/comments", (request, response) => {
  const body = validateAddCommentBody(request.body);
  response.status(201).json(helpdeskService.addComment(request.params.id, body));
});

export default router;
