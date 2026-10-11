// Types for the AstroMool API client. Field shapes follow https://developers.astromool.com/docs
export declare const VERSION: string;

/** A place: lat + lon (+ tz_id or utc_offset), or just place (a name, looked up; the choice is reported in meta.warnings). */
export interface Place {
  lat?: number;
  lon?: number;
  /** IANA time zone, e.g. Asia/Kolkata (preferred; filled in from the place lookup when absent) */
  tz_id?: string;
  /** Only if tz_id is not known, e.g. +05:30 */
  utc_offset?: string;
  /** Place name, e.g. "Patna" - used when lat/lon are absent */
  place?: string;
}
export interface Birth extends Place {
  /** YYYY-MM-DD or DD-MM-YYYY */
  date: string;
  /** 24-hour HH:MM[:SS] or h:mm AM/PM. Required unless birth_time_unknown is true. */
  time?: string;
  /** No birth time: a 12:00 chart; meta.warnings names the unreliable parts */
  birth_time_unknown?: boolean;
}
/** For calculators: birth date and time are needed only where input.for is "birth" or "today"; the year/date/next
 *  calculators need only the place (lat, lon, tz_id). */
export interface Person extends Omit<Birth, "date"> {
  date?: string;
  name?: string;
  gender?: "male" | "female";
}
export interface ChartImageOptions { style?: "north" | "south"; chart?: string; format?: "svg" | "png"; theme?: "light" | "dark"; size?: number; }
export interface BatchItem { method?: "GET" | "POST"; path: string; body?: any; }
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

export interface CalculatorInput {
  /** birth: the birth chart. today: today at the place, read for the birth chart. year: params.year/month at a place.
   *  date: params.date at a place. next: the next occurrence from today at a place. */
  for: "birth" | "today" | "year" | "date" | "next";
  birth_details: boolean;
  partner: boolean;
  /** extra params this calculator uses, name -> meaning */
  params: Record<string, string>;
  /** false: the answer is only its full text (detail=full, Growth plan and up) */
  basic_output: boolean;
}
export interface CalculatorInfo { slug: string; type: string; name: string; category: string; needs_partner: boolean; input: CalculatorInput; }
export interface GuidanceSection { title?: string; type?: string; text?: string; body?: string; header?: string[]; rows?: string[][]; }
export interface Guidance { sections?: GuidanceSection[]; dos?: string[]; donts?: string[]; remedies?: string[]; next?: string; [k: string]: any; }
export interface CalculatorResult {
  calculator: { slug: string; type: string; name: string; category: string };
  /** one-paragraph answer, or null when the calculator has none */
  summary: string | null;
  /** the calculator's structured reading, when it has one */
  guidance?: Guidance;
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
  vedic: {
    chart(birth: Birth): Promise<Envelope<any>>;
    houses(birth: Birth): Promise<Envelope<any>>;
    ashtakavarga(birth: Birth): Promise<Envelope<any>>;
    /** all 16 vargas, or one ("D9") */
    divisional(birth: Birth, chart?: string): Promise<Envelope<any>>;
    /** SVG text or PNG bytes */
    chartImage(birth: Birth, opts?: ChartImageOptions): Promise<string | Uint8Array>;
  };
  dasha: { vimshottari(birth: Birth): Promise<Envelope<any>>; yogini(birth: Birth): Promise<Envelope<any>>; };
  panchang: {
    day(place: Place, date?: string): Promise<Envelope<any>>;
    rahuKaal(place: Place, date?: string): Promise<Envelope<any>>;
    choghadiya(place: Place, date?: string): Promise<Envelope<any>>;
    hora(place: Place, date?: string): Promise<Envelope<any>>;
  };
  match: { ashtakoot(person: Birth & { name?: string }, partner: Birth & { name?: string }): Promise<Envelope<any>>; };
  numerology: { core(name: string, date: string, asOf?: string): Promise<Envelope<any>>; };
  dosha: { check(name: string, birth: Birth & { name?: string; gender?: "male" | "female" }): Promise<Envelope<CalculatorResult>>; summary(birth: Birth): Promise<Envelope<any>>; };
  remedies: { get(name: "gemstone" | "rudraksha" | "lal-kitab" | "lucky" | string, birth: Birth): Promise<Envelope<CalculatorResult>>; };
  transit: { positions(opts?: Place & { date?: string; time?: string; ayanamsa?: string; node?: "mean" | "true" }): Promise<Envelope<any>>; natal(birth: Birth, onDate?: string): Promise<Envelope<any>>; };
  kp: { chart(birth: Birth & { ayanamsa?: string; node?: "mean" | "true" }): Promise<Envelope<any>>; rulingPlanets(opts?: Place & { date?: string; time?: string }): Promise<Envelope<any>>; subTable(): Promise<Envelope<any>>; };
  western: {
    natal(birth: Birth & { house_system?: string }): Promise<Envelope<any>>;
    synastry(person: Birth, partner: Birth): Promise<Envelope<any>>;
    progressions(birth: Birth, onDate?: string): Promise<Envelope<any>>;
    composite(person: Birth, partner: Birth): Promise<Envelope<any>>;
  };
  /** up to 20 calls in one request; each is metered as if called alone */
  batch(requests: BatchItem[]): Promise<Envelope<{ responses: { path: string; status: number; body?: any }[] }>>;
  /** any topic endpoint, e.g. topic("/v1/muhurat/vivah", { person: { place: "Delhi" }, params: { year: 2027 } }) */
  topic(path: string, body: any): Promise<Envelope<CalculatorResult>>;
  request<T = any>(method: string, path: string, body?: any, headers?: Record<string, string>, query?: Record<string, any>): Promise<T>;
}

/** Verify a report webhook (Node.js): raw body, X-AstroMool-Signature header, your webhook secret. */
export declare function verifyWebhook(rawBody: string | Uint8Array, signatureHeader: string, secret: string, toleranceSeconds?: number): ReportWebhookEvent;
export default AstroMool;
