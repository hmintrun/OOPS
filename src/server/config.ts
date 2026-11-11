import "server-only";
import { unavailable } from "./errors";

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw unavailable();
  return value;
}

export function appOrigin(): string {
  try {
    const url = new URL(requiredEnv("APP_URL"));
    if (!["http:", "https:"].includes(url.protocol) || url.href !== url.origin + "/") throw unavailable();
    return url.origin;
  } catch {
    throw unavailable();
  }
}
