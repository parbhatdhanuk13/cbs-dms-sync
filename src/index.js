const express = require("express");
const env = require("./config/env");
const logger = require("./logger");
const { login } = require("./services/tokenManager");
const adminRoutes = require("./routes/admin");

async function bootstrap() {
  try {
    // Warm token at boot
    await login();
    logger.info("CBS token warmed");

    const app = express();
    app.use(express.json({ limit: "10mb" }));
    app.use("/admin", adminRoutes);

    const server = app.listen(env.PORT, () => {
      logger.info("Server started", { port: env.PORT, env: env.NODE_ENV });
    });

    const shutdown = async (sig) => {
      logger.warn("Shutting down", { signal: sig });
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 15000);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    logger.error("Bootstrap failed", { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

process.on("unhandledRejection", (err) =>
  logger.error("Unhandled rejection", { error: err?.message, stack: err?.stack })
);
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

bootstrap();