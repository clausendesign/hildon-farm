declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    MARKET_EDITOR_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
