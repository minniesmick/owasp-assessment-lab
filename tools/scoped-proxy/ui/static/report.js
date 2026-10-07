'use strict';
// Report helpers: mask secrets in a captured exchange and turn it into Markdown for a finding. Pure functions, no network,
// exported for `node --test`. The captured data is untrusted text: it is only ever placed in a Markdown string or a textarea value.
(function (root) {
  const MASK = '[masked]';
  const JWT_RE = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g;
  const SECRET_PARAM_RE = /([?&](?:token|access_token|id_token|password|passwd|pwd|secret|api[_-]?key|apikey|auth|jwt)=)([^&#\s]+)/gi;
  const MASKED_HEADERS = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token)$/i;
  const OWASP_NAMES = {
    A01: 'Broken Access Control', A02: 'Security Misconfiguration', A03: 'Software Supply Chain Failures', A04: 'Cryptographic Failures',
    A05: 'Injection', A06: 'Insecure Design', A07: 'Authentication Failures', A08: 'Software or Data Integrity Failures',
    A09: 'Security Logging and Alerting Failures', A10: 'Mishandling of Exceptional Conditions',
  };
  const VERSION = 'v20.2.0'; // the Juice Shop release this project assesses (see AGENTS.md)

  const maskJwts = (text) => String(text == null ? '' : text).replace(JWT_RE, MASK);

  function maskHeaderValue(name, value) {
    const v = String(value);
    if (/^(set-)?cookie$/i.test(name)) {
      // keep cookie names, mask values: "a=1; b=2" -> "a=[masked]; b=[masked]"; for Set-Cookie keep the attributes
      return v.split(';').map((part, i) => {
        const eq = part.indexOf('=');
        if (eq < 0) return part;
        const key = part.slice(0, eq);
        if (/^set-cookie$/i.test(name) && i > 0) return part; // Path=/, Expires=...
        return `${key}=${MASK}`;
      }).join(';');
    }
    const scheme = v.match(/^(Bearer|Basic|Digest|Token)\s+/i);
    return scheme ? `${scheme[1]} ${MASK}` : MASK;
  }

  function maskHeaders(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) out[k] = MASKED_HEADERS.test(k) ? maskHeaderValue(k, v) : maskJwts(v);
    return out;
  }

  const maskUrl = (url) => maskJwts(String(url || '').replace(SECRET_PARAM_RE, `$1${MASK}`));

  // A copy of the record with credentials removed. Bodies are only touched where they contain a JWT: a login payload or a
  // password field is the evidence in many findings, so those are left for the author to judge.
  function maskRecord(r) {
    return {
      ...r,
      url: maskUrl(r.url),
      request_headers: maskHeaders(r.request_headers),
      response_headers: maskHeaders(r.response_headers),
      request_body: maskJwts(r.request_body),
      response_body: maskJwts(r.response_body),
    };
  }

  // A fence longer than any backtick run in the text, so a response body can never close the block early.
  function fence(text, lang = '') {
    const runs = String(text).match(/`+/g) || [];
    const n = Math.max(3, ...runs.map((s) => s.length + 1));
    const ticks = '`'.repeat(n);
    return `${ticks}${lang}\n${text}\n${ticks}`;
  }

  const slugify = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');

  const pad3 = (n) => String(Math.max(1, Math.min(999, parseInt(n, 10) || 1))).padStart(3, '0');
  const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
  const MAX_RESPONSE = 800;

  // fields: { owasp, title, cwe, tester, tools, num, date }; ctx: { requestBlock, path, method, status, responseHead, responseBody }
  function buildFinding(fields, ctx) {
    const owasp = /^A(0[1-9]|10)$/.test(fields.owasp || '') ? fields.owasp : 'A0X';
    const id = `JS-${owasp}-${pad3(fields.num)}`;
    const slug = slugify(fields.title) || 'short-description';
    const fileName = `${id}-${slug}.md`;
    const cwe = /^CWE-\d+$/.test(fields.cwe || '') ? fields.cwe : 'CWE-0';
    const target = `Juice Shop ${VERSION} / ${ctx.method} ${ctx.path}`;

    const front = [
      '---',
      `id: ${id}`,
      `title: ${(fields.title || 'TODO short English title').replace(/[\r\n]+/g, ' ')}`,
      'source: juice-shop',
      `target: ${yamlStr(target)}`,
      `owasp: ${owasp}`,
      `cwe: ${cwe}`,
      'severity: TODO            # critical | high | medium | low | info, must match cvss_score',
      'cvss_vector: "CVSS:3.1/TODO"   # derive it from what you observed, see AGENTS.md',
      'cvss_score: 0.0',
      `tester: ${fields.tester || 'name-surname'}`,
      `tools: ${fields.tools || 'DevTools'}`,
      `date: ${fields.date}`,
      'status: draft',
      'evidence:',
      `  - evidence/juice-shop/${id}-1.png`,
      '---',
    ].join('\n');

    let observed = '';
    if (ctx.status) {
      let body = ctx.responseBody || '';
      const cut = body.length > MAX_RESPONSE;
      if (cut) body = `${body.slice(0, MAX_RESPONSE)}\n... (truncated, ${ctx.responseBody.length} characters in total)`;
      const head = `HTTP ${ctx.status}${ctx.responseHead ? `\n${ctx.responseHead}` : ''}${body ? `\n\n${body}` : ''}`;
      observed = `\nResponse observed:\n${fence(head, 'http')}\n`;
    }

    const bodyMd = `
## Summary
TODO: one or two sentences. What is vulnerable and why does it matter?

## Attack concept
TODO: how this class of vulnerability works in general (2-4 sentences, your own words).

## Steps to reproduce
1. Start Juice Shop locally (\`docker compose up -d\`) and open http://127.0.0.1:3000
2. TODO: describe what you did, step by step, and name the tool for each step (e.g. "Scoped Proxy -> HTTP history").
3. TODO: send the request below and describe what you saw.

Payload / request used:
${fence(ctx.requestBlock, 'http')}
${observed}
## Evidence
![Step 1](../../evidence/juice-shop/${id}-1.png)

## Impact
TODO: what does an attacker gain (confidentiality / integrity / availability)? Justify the CVSS score.

## Detection
TODO: how would a defender or tester notice this (manual test, scanner, logs, code review)?

## Mitigation
TODO: a concrete fix for this case, with a link to the relevant OWASP Cheat Sheet.

## References
- OWASP Top 10:2025 - ${owasp}${OWASP_NAMES[owasp] ? ` ${OWASP_NAMES[owasp]}` : ''}
- TODO: OWASP Cheat Sheet or CWE page
`;
    return { id, fileName, markdown: `${front}\n${bodyMd}` };
  }

  const MAX_EVIDENCE_BODY = 2000;
  const TARGET_URL = /^http:\/\/127\.0\.0\.1:3000\//;

  function prettyBody(text) {
    const t = String(text == null ? '' : text);
    const s = t.trim();
    if (s[0] === '{' || s[0] === '[') { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { /* not JSON */ }}
    return t;
  }

  // Evidence for a screenshot or the report: the request block, then the response. Pass records through maskRecord first.
  // ctx: { requestBlock, status, responseHeaders, responseBody }
  function buildEvidence(ctx) {
    const parts = ['**Request**', fence(ctx.requestBlock, 'http')];
    if (ctx.status) {
      let body = prettyBody(ctx.responseBody);
      if (body.length > MAX_EVIDENCE_BODY) body = `${body.slice(0, MAX_EVIDENCE_BODY)}\n... (truncated, ${body.length} characters in total)`;
      const head = Object.entries(ctx.responseHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
      parts.push(`**Response** (HTTP ${ctx.status})`, fence(`HTTP ${ctx.status}${head ? `\n${head}` : ''}${body ? `\n\n${body}` : ''}`, 'http'));
    } else {
      parts.push('**Response**: none captured.');
    }
    return `${parts.join('\n\n')}\n`;
  }

  // A JSON string literal is also a valid Python string literal (and a dict of strings a valid dict literal).
  const py = (s) => JSON.stringify(String(s));

  // "Copy as Python": a requests script for one captured request. Only ever text; it refuses anything but the lab target.
  // ctx: { method, url, headers, body }
  function buildPython(ctx) {
    if (!TARGET_URL.test(ctx.url)) throw new Error('Only the local Juice Shop (http://127.0.0.1:3000) can be exported.');
    const method = String(ctx.method).toUpperCase().replace(/[^A-Z]/g, '');
    const headers = Object.entries(ctx.headers || {});
    const masked = headers.some(([, v]) => String(v).includes(MASK)) || String(ctx.body || '').includes(MASK) || ctx.url.includes(MASK);
    const lines = ['import requests', ''];
    if (masked) lines.push(`# Secrets are masked as ${MASK}. Put your own values back before you run it.`);
    lines.push(`url = ${py(ctx.url)}`);
    lines.push(headers.length ? `headers = {\n${headers.map(([k, v]) => `    ${py(k)}: ${py(v)},`).join('\n')}\n}` : 'headers = {}');
    if (ctx.body) lines.push(`data = ${py(ctx.body)}.encode("utf-8")`);
    lines.push('', `response = requests.request(${py(method)}, url, headers=headers${ctx.body ? ', data=data' : ''}, timeout=10)`,
      'print(response.status_code)', 'print(response.text)');
    return `${lines.join('\n')}\n`;
  }

  const api = { buildEvidence, buildPython, prettyBody, MASK, maskJwts, maskHeaders, maskHeaderValue, maskUrl, maskRecord, fence, slugify, buildFinding, VERSION, OWASP_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Report = api;
})(typeof window !== 'undefined' ? window : globalThis);
