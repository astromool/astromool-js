"use strict";
/**
 * AstroMool API client for Node.js 18+ and browsers (widget keys). No dependencies.
 * Every method resolves to the API's envelope: { data, meta }.
 * https://developers.astromool.com/docs
 */
const VERSION = "1.0.0";
const RETRY_STATUS = new Set([500, 502, 503, 504]);

class AstroMoolError extends Error {
  constructor(status, body, headers) {
    const b = body && typeof body === "object" ? body : {};
    super(b.detail || b.title || "HTTP " + status);
    this.name = "AstroMoolError";
    this.status = status;
    this.code = b.code || (status ? "http_" + status : "network_error");
    this.title = b.title || null;
    this.detail = b.detail || null;
    this.requestId = b.request_id || (headers && headers.get ? headers.get("x-request-id") : null) || null;
    this.field = b.field || null;
    this.errors = b.errors || null;
    this.retryAfter = b.retry_after != null ? Number(b.retry_after) : null;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomId() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  return require("crypto").randomUUID();
}

class AstroMool {
  /**
   * @param {string} apiKey  am_test_..., am_live_... (server) or am_pub_... (browser, domain-locked)
   * @param {{baseUrl?: string, timeout?: number, maxRetries?: number, fetch?: Function}} [opts]
   */
  constructor(apiKey, opts = {}) {
    if (!apiKey || !/^am_(live|test|pub)_/.test(apiKey)) throw new Error("AstroMool: pass your API key (am_test_..., am_live_... or am_pub_...)");
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl || "https://api.astromool.com").replace(/\/+$/, "");
    this.timeout = opts.timeout != null ? opts.timeout : 30000;
    this.maxRetries = opts.maxRetries != null ? opts.maxRetries : 2;
    this._fetch = opts.fetch || globalThis.fetch;
    if (!this._fetch) throw new Error("AstroMool: no fetch() available - use Node.js 18+ or pass opts.fetch");
    this.calculators = {
      list: () => this.request("GET", "/v1/calculators"),
      run: (slug, person, o = {}) => this.request("POST", "/v1/calculators/" + encodeURIComponent(slug),
        clean({ person, partner: o.partner, params: o.params, detail: o.detail })),
    };
    this.reports = {
      create: (slug, person, o = {}) => this.request("POST", "/v1/reports/" + encodeURIComponent(slug),
        clean({ person, partner: o.partner, params: o.params, lang: o.lang, webhook_url: o.webhookUrl }),
        { "Idempotency-Key": o.idempotencyKey || randomId() }),
      get: (reportId) => this.request("GET", "/v1/reports/" + encodeURIComponent(reportId)),
      waitUntilReady: (reportId, o = {}) => this._wait(reportId, o.timeout || 300000, o.interval || 2000),
      download: (downloadUrl) => this._download(downloadUrl),
    };
    this.geo = {
      search: (q, limit) => this.request("GET", "/v1/geo/search", undefined, undefined, clean({ q, limit })),
      timezone: (tzId, date, time) => this.request("GET", "/v1/geo/timezone", undefined, undefined, clean({ tz_id: tzId, date, time })),
    };
    this.meta = { ayanamsas: (date) => this.request("GET", "/v1/meta/ayanamsas", undefined, undefined, clean({ date })) };
  }

  /** Ascendant and the nine grahas. birth = {date, time, tz_id | utc_offset, lat, lon}; o = {ayanamsa, node} */
  planets(birth, o = {}) { return this.request("POST", "/v1/vedic/planets", Object.assign({}, birth, clean(o))); }
  usage() { return this.request("GET", "/v1/usage"); }
  health() { return this.request("GET", "/v1/health"); }

  async request(method, path, body, extraHeaders, query) {
    let url = this.baseUrl + path;
    if (query && Object.keys(query).length) url += "?" + new URLSearchParams(query).toString();
    const headers = Object.assign({ "X-API-Key": this.apiKey, Accept: "application/json" }, extraHeaders || {});
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (typeof window === "undefined") headers["User-Agent"] = "astromool-js/" + VERSION;
    for (let attempt = 0; ; attempt++) {
      let res, json;
      try {
        res = await this._fetchWithTimeout(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        const text = await res.text();
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = { detail: text.slice(0, 300) }; }
      } catch (e) {
        if (attempt < this.maxRetries) { await sleep(500 * 2 ** attempt); continue; }
        const err = new AstroMoolError(0, { code: "network_error", detail: String(e && e.message || e) });
        throw err;
      }
      if (res.ok) return json;
      const err = new AstroMoolError(res.status, json, res.headers);
      const retryable = (res.status === 429 && err.code === "rate_limited") || RETRY_STATUS.has(res.status);
      if (retryable && attempt < this.maxRetries) {
        const ra = Number(res.headers.get("retry-after")) || err.retryAfter;
        await sleep(res.status === 429 ? Math.min(60, ra || 1) * 1000 : 500 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  async _fetchWithTimeout(url, init) {
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ac ? setTimeout(() => ac.abort(), this.timeout) : null;
    try { return await this._fetch(url, ac ? Object.assign({ signal: ac.signal }, init) : init); }
    finally { if (t) clearTimeout(t); }
  }

  async _wait(reportId, timeoutMs, intervalMs) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const r = await this.reports.get(reportId);
      if (r.data.status === "ready") return r;
      if (r.data.status === "expired") throw new AstroMoolError(410, { code: "report_gone", detail: "Report files are kept for 7 days. Create the report again." });
      if (r.data.status === "failed") throw new AstroMoolError(422, { code: "report_failed", title: "Report failed", detail: r.data.error || "The report could not be generated. It was not charged.", request_id: r.meta && r.meta.request_id });
      if (Date.now() > end) throw new AstroMoolError(0, { code: "timeout", detail: "Report " + reportId + " not ready after " + Math.round(timeoutMs / 1000) + " s; it is still building - call reports.get later." });
      await sleep(intervalMs);
    }
  }

  /** Downloads the PDF behind a signed download_url (no key is sent). Resolves to a Uint8Array. */
  async _download(downloadUrl) {
    const res = await this._fetchWithTimeout(downloadUrl, { method: "GET" });
    if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) { /* not json */ } throw new AstroMoolError(res.status, j, res.headers); }
    return new Uint8Array(await res.arrayBuffer());
  }
}

function clean(o) {
  const r = {};
  for (const k of Object.keys(o || {})) if (o[k] !== undefined && o[k] !== null) r[k] = o[k];
  return r;
}

/**
 * Verify a report webhook (Node.js). Pass the RAW request body (string or Buffer), the X-AstroMool-Signature
 * header and your webhook secret (dashboard > Keys). Returns the parsed event; throws AstroMoolError otherwise.
 */
function verifyWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  const nodeCrypto = require("crypto");
  const parts = {};
  String(signatureHeader || "").split(",").forEach((p) => { const i = p.indexOf("="); if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  const fail = (d) => { throw new AstroMoolError(400, { code: "webhook_signature_invalid", detail: d }); };
  if (!parts.t || !parts.v1) fail("X-AstroMool-Signature header missing or malformed.");
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!(age <= toleranceSeconds)) fail("Webhook timestamp is outside the tolerance window.");
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const good = nodeCrypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(parts.t + "."), raw])).digest();
  let got;
  try { got = Buffer.from(parts.v1, "hex"); } catch (e) { fail("Signature is not hex."); }
  if (got.length !== good.length || !nodeCrypto.timingSafeEqual(got, good)) fail("Signature does not match.");
  return JSON.parse(raw.toString("utf8"));
}

module.exports = { AstroMool, AstroMoolError, verifyWebhook, VERSION };
module.exports.default = AstroMool;
