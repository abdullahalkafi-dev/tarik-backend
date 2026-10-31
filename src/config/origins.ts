import config from "./index";

/**
 * One allow-list shared by the HTTP CORS policy and the Socket.IO server so
 * the two can never drift apart.
 */
export const getAllowedOrigins = (): string[] => {
  const split = (value?: string) =>
    value
      ? value
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

  const defaults = [
    "https://tarikapp.joura.info",
    "https://tarikappapi.joura.info",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
  ];

  return Array.from(
    new Set([...split(config.cors.origin), ...split(config.socket.cors_origin), ...defaults]),
  );
};
