// Types for the AstroMool API client. Field shapes follow https://developers.astromool.com/docs
export declare const VERSION: string;

export interface Birth {
  /** YYYY-MM-DD or DD-MM-YYYY */
  date: string;
  /** 24-hour HH:MM[:SS] or h:mm AM/PM */
  time: string;
  /** IANA time zone, e.g. Asia/Kolkata (preferred) */
  tz_id?: string;
  /** Only if tz_id is not known, e.g. +05:30 */
  utc_offset?: string;
  lat: number;
  lon: number;
}
export interface Person extends Birth {
  name?: string;
  gender?: "male" | "female";
  place?: string;
}
export interface Meta {
  request_id: string;
  engine: string;
  units_charged: number;
  warnings: string[];
  ayanamsa?: { id: string; value: number };
  input?: { utc_offset: string; offset_source: string; utc: string };
}
export interface Envelope<T = any> { data: T; meta: Meta; }

export interface ChartPoint {
  longitude: number; sign: string; rashi: string; sign_lord: string; degree_in_sign: number;
  nakshatra: string; nakshatra_lord: string; pada: number; house?: number | null;
}
export interface Planet extends ChartPoint { name: string; speed: number; retrograde: boolean; }
export interface PlanetsData { ascendant: ChartPoint; planets: Planet[]; house_system: string; node: string; }

export interface CalculatorInfo { slug: string; type: string; name: string; category: string; needs_partner: boolean; }
export interface CalculatorResult {
  calculator: { slug: string; type: string; name: string; category: string };
  summary: string | null;
  result: Record<string, any>;
  html?: string;
  text?: string;
}
export interface Report {
  report_id: string; calculator: string; lang: "en" | "hi" | "both"; branding: string;
  status: "queued" | "processing" | "ready" | "failed" | "expired";
  pages: number | null; bytes: number | null; error: string | null;
  created_at: string; ready_at: string | null; expires_at: string | null; downloads: number; webhook_status: string | null;
  download_url?: string; download_url_expires_in?: number; status_url?: string; idempotent_replay?: boolean;
}
export interface ReportWebhookEvent { event: "report.ready" | "report.failed"; report_id: string; status: string; download_url?: string; }

export interface ClientOptions {
  /** default https://api.astromool.com */
  baseUrl?: string;
  /** per-request timeout in ms, default 30000 */
  timeout?: number;
  /** retries for rate_limited (429, waits Retry-After), 5xx and network errors; default 2 */
  maxRetries?: number;
  fetch?: typeof fetch;
}

export declare class AstroMoolError extends Error {
  status: number;
  /** stable code - see https://developers.astromool.com/errors. SDK-side: network_error, timeout, report_failed, webhook_signature_invalid */
  code: string;
  title: string | null;
  detail: string | null;
  requestId: string | null;
  field: string | null;
  errors: { field: string; message: string }[] | null;
  retryAfter: number | null;
  body: any;
}

export declare class AstroMool {
  constructor(apiKey: string, opts?: ClientOptions);
  planets(birth: Birth, opts?: { ayanamsa?: string; node?: "mean" | "true" }): Promise<Envelope<PlanetsData>>;
  usage(): Promise<Envelope<{ plan: string; key_kind: string; units_used_this_month: number; monthly_units: number | null; requests_per_minute: number; month_timezone: string }>>;
  health(): Promise<Envelope<{ ok: boolean; ephemeris: string; env: string }>>;
  calculators: {
    list(): Promise<Envelope<{ count: number; calculators: CalculatorInfo[] }>>;
    run(slug: string, person: Person, opts?: { partner?: Person; params?: Record<string, string | number>; detail?: "basic" | "full" }): Promise<Envelope<CalculatorResult>>;
  };
  reports: {
    /** An Idempotency-Key is generated per call unless you pass one, so retries never create a second report. */
    create(slug: string, person: Person, opts?: { partner?: Person; params?: Record<string, string | number>; lang?: "en" | "hi" | "both"; webhookUrl?: string; idempotencyKey?: string }): Promise<Envelope<Report>>;
    get(reportId: string): Promise<Envelope<Report>>;
    waitUntilReady(reportId: string, opts?: { timeout?: number; interval?: number }): Promise<Envelope<Report>>;
    download(downloadUrl: string): Promise<Uint8Array>;
  };
  geo: {
    search(q: string, limit?: number): Promise<Envelope<{ query: string; places: { name: string; admin1: string; country: string; country_code: string; lat: number; lon: number; tz_id: string; label: string }[] }>>;
    timezone(tzId: string, date: string, time?: string): Promise<Envelope<{ tz_id: string; local: string; utc_offset: string; offset_hours: number }>>;
  };
  meta: { ayanamsas(date?: string): Promise<Envelope<{ date: string; default: string; ayanamsas: { id: string; name: string; value_deg: number }[] }>> };
  request<T = any>(method: string, path: string, body?: any, headers?: Record<string, string>, query?: Record<string, any>): Promise<T>;
}

/** Verify a report webhook (Node.js): raw body, X-AstroMool-Signature header, your webhook secret. */
export declare function verifyWebhook(rawBody: string | Uint8Array, signatureHeader: string, secret: string, toleranceSeconds?: number): ReportWebhookEvent;
export default AstroMool;
