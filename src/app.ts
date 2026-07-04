import express from "express";
import { webhookRouter } from "./routes/webhook";
import { clinic } from "./clinic";

export const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "DentroBot", clinic: clinic.name });
});

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use("/webhook", webhookRouter);
