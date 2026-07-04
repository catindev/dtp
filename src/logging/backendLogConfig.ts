export const BACKEND_BASE_URL = import.meta.env?.VITE_DTP_BACKEND_URL ?? "http://127.0.0.1:8787";
export const BACKEND_LOG_URL = `${BACKEND_BASE_URL}/api/log`;
export const BACKEND_RESET_URL = `${BACKEND_BASE_URL}/api/reset`;
export const BACKEND_LOG_QUEUE_KEY = "dtp.backendLogQueue.v1";
export const BACKEND_LOG_SEQ_KEY_PREFIX = "dtp.backendLogSeq.v1";
export const BACKEND_LOG_QUEUE_LIMIT = 1200;
export const BACKEND_LOG_BATCH_SIZE = 80;
export const BACKEND_LOG_FLUSH_INTERVAL_MS = 2500;
