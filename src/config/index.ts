import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  app_name: process.env.APP_NAME || "Tarik",
  node_env: process.env.NODE_ENV || "development",
  port: process.env.PORT || "5000",

  database_url: process.env.DATABASE_URL,
  database: {
    max_pool_size: process.env.DB_MAX_POOL_SIZE || "10",
  },

  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS || "8",
  admin_secret_key: process.env.ADMIN_SECRET_KEY,
  admin_seed_email: process.env.ADMIN_SEED_EMAIL,
  admin_seed_password: process.env.ADMIN_SEED_PASSWORD,

  jwt: {
    jwt_secret: process.env.JWT_SECRET,
    jwt_expire_in: process.env.JWT_EXPIRE_IN || "30d",
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
    jwt_refresh_expire_in: process.env.JWT_REFRESH_EXPIRE_IN || "30d",
  },

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || "6379",
    password: process.env.REDIS_PASSWORD,
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== "false",
    prefix: process.env.CACHE_PREFIX || "tarik",
    ttl: {
      userProfileSeconds: process.env.CACHE_USER_PROFILE_TTL_SECONDS || "300",
    },
  },

  resend: {
    api_key: process.env.RESEND_API_KEY,
    mail_domain: process.env.MAIL_DOMAIN,
  },

  aws_s3: {
    access_key_id: process.env.AWS_ACCESS_KEY_ID,
    secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "us-east-1",
    bucket: process.env.AWS_S3_BUCKET || "tarik-app-bucket",
  },

  stripe: {
    secret_key: process.env.STRIPE_SECRET_KEY,
    webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  socket: {
    enabled: process.env.SOCKET_ENABLED !== "false",
    cors_origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:3000",
  },

  firebase: {
    service_account_json: (() => {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
      if (!projectId || !clientEmail || !privateKey) return null;
      return {
        type: "service_account",
        project_id: projectId,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
        private_key: privateKey,
        client_email: clientEmail,
        client_id: process.env.FIREBASE_CLIENT_ID || "",
        auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
        token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL || "",
        universe_domain: "googleapis.com",
      };
    })(),
  },

  logging: {
    level: process.env.LOG_LEVEL || "debug",
    format: process.env.LOG_FORMAT || "json",
    enable_request_logging: process.env.ENABLE_REQUEST_LOGGING !== "false",
  },

  rate_limit: {
    window_ms: process.env.RATE_LIMIT_WINDOW_MS || "900000",
    max_requests: process.env.RATE_LIMIT_MAX_REQUESTS || "100",
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: process.env.CORS_CREDENTIALS !== "false",
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || "localhost",
    port: Number(process.env.MINIO_PORT) || 9000,
    access_key: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secret_key: process.env.MINIO_SECRET_KEY || "minioadmin123",
    bucket: process.env.MINIO_BUCKET || "tarik-uploads",
    use_ssl: process.env.MINIO_USE_SSL === "true",
    base_url: process.env.MINIO_BASE_URL || "http://localhost:9000",
    public_url: process.env.MINIO_PUBLIC_URL || process.env.MINIO_BASE_URL || "http://localhost:9000",
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "./uploads",
    max_file_size_mb: process.env.MAX_FILE_SIZE_MB || "50",
  },

  urls: {
    frontend_url: process.env.FRONTEND_URL || "http://localhost:3000",
    api_base_url: process.env.API_BASE_URL || "http://localhost:5000",
  },

  locationiq: {
    api_key: process.env.LOCATIONIQ_API_KEY || "",
    base_url: process.env.LOCATIONIQ_BASE_URL || "https://us1.locationiq.com/v1",
  },

  didit: {
    api_key: process.env.DIDIT_API_KEY || "",
    workflow_id: process.env.DIDIT_WORKFLOW_ID || "",
    webhook_secret: process.env.DIDIT_WEBHOOK_SECRET || "",
  },
};
