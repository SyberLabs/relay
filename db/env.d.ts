declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RELAY_AGENTS?: string;
    RELAY_AGENTS_LIVE?: string;
    RELAY_AGENTS_MODEL?: string;
    RELAY_PAUSE?: string;
    OPENAI_API_KEY?: string;
    RELAY_AGENTS_USER_DAY_CENTS?: string;
    RELAY_AGENTS_GLOBAL_DAY_CENTS?: string;
    RELAY_AGENTS_GLOBAL_MONTH_CENTS?: string;
    RELAY_AGENTS_RESERVE_CENTS?: string;
  }
}
