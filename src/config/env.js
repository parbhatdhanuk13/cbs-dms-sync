const { z } = require("zod");
require("dotenv").config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5050),
  LOG_LEVEL: z.string().default("info"),
  LOG_DIR: z.string().default("./logs"),

  CBS_BASE_URL: z.string().url(),
  CBS_USERNAME: z.string().min(1),
  CBS_PASSWORD: z.string().min(1),
  CBS_RATE_LIMIT_PER_MIN: z.coerce.number().default(9),
  CBS_TOKEN_REFRESH_MARGIN_MS: z.coerce.number().default(300000),

  DMS_BASE_URL: z.string().url(),
  DMS_API_KEY: z.string().min(1),

  SYNC_FROM_DATE: z.string(),
  SYNC_TO_DATE: z.string(),
  SYNC_DOCUMENT_TYPE: z.coerce.number().default(-1),
  SYNC_BRANCH: z.coerce.number().default(-1),

  DOWNLOAD_CONCURRENCY: z.coerce.number().default(2),
  DMS_CONCURRENCY: z.coerce.number().default(3),

  MAX_RETRY_ATTEMPTS: z.coerce.number().default(5),
  RETRY_BACKOFF_MS: z.coerce.number().default(5000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
module.exports = parsed.data;