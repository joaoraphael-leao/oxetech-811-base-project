import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import "dotenv/config";
import router from "./controllers/helpdesk.controller";
import { AppError } from "./errors/app-error";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", router);

app.use((_request, response) => {
  response.status(404).json({ error: "Rota nao encontrada" });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    response.status(error.status).json({ error: error.message, ...error.details });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Erro interno do servidor" });
});

export default app;
