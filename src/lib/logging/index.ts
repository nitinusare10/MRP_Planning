import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "accessTokenEncrypted",
      "refreshTokenEncrypted",
      "*.accessTokenEncrypted",
      "*.refreshTokenEncrypted",
      "accessToken",
      "refreshToken",
      "*.accessToken",
      "*.refreshToken",
      "clientSecret",
      "*.clientSecret",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  transport:
    !isProduction && level !== "silent"
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        }
      : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
