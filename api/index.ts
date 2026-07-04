/**
 * Entry point Vercel (serverless).
 * Rulează migrația o singură dată per instanță (lazy), apoi servește aplicația Express.
 */
import type { Request, Response } from "express";
import { app } from "../src/app";
import { migrate } from "../src/db";

let migrationPromise: Promise<void> | null = null;

export default async function handler(req: Request, res: Response) {
  if (!migrationPromise) {
    migrationPromise = migrate().catch(err => {
      migrationPromise = null; // permite retry la următorul request
      throw err;
    });
  }
  await migrationPromise;
  return (app as any)(req, res);
}
