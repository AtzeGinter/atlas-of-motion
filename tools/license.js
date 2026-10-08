#!/usr/bin/env node
// Atlas of Motion licence keys: ECDSA P-256 / SHA-256, offline verification. Built-in `crypto` only, no npm packages.
//   node tools/license.js keygen [--out <dir>] [--force]
//   node tools/license.js sign [--name "..."] [--exp YYYY-MM-DD] [--tier pro] [--key <private.pem>]
//   node tools/license.js verify <key> [--pub <public.jwk>]
// Key format: AOM1-<base64url(payload JSON)>.<base64url(64-byte IEEE P1363 signature over the ASCII text "AOM1." + base64url(payload JSON))>
// See docs/licensing.md. The private key never goes into the repository.
'use strict';
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const PUB_PATH = path.join(__dirname, 'license-public.jwk');
const REV_PATH = path.join(__dirname, 'data', 'revoked.txt');
const DEF_DIR = path.join(os.homedir(), '.atlas-of-motion');
const ID_RE = /^[A-Z2-7]{10}$/, DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIERS = ['pro'];
const b64u = b => Buffer.from(b).toString('base64url');

function isDate(s) { return DATE_RE.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
function newId() { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', r = crypto.randomBytes(10); let s = ''; for (const x of r) s += A[x & 31]; return s; } // 256 % 32 == 0: unbiased
function today() { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

// strip all whitespace (pasted keys often contain line breaks), split into payload / signature parts
function parseKey(str) {
  const s = String(str == null ? '' : str).replace(/\s+/g, '');
  const m = /^AOM1-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(s);
  if (!m) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const sig = Buffer.from(m[2], 'base64url');
  if (sig.length !== 64) return null;
  return { key: s, pb64: m[1], sig, payload };
}
function checkPayload(p) {
  return p.v === 1 && ID_RE.test(p.id || '') && TIERS.includes(p.tier) && isDate(p.iat || '') &&
    (p.exp === undefined || isDate(p.exp)) && (p.name === undefined || (typeof p.name === 'string' && p.name.length <= 40));
}
function loadRevoked(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
}
// -> {ok:true, payload} | {ok:false, reason: format|signature|expired|revoked}
function verifyKey(str, jwk, revoked, now) {
  const k = parseKey(str);
  if (!k) return { ok: false, reason: 'format' };
  let good = false;
  try {
    const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    good = crypto.verify('sha256', Buffer.from('AOM1.' + k.pb64, 'ascii'), { key: pub, dsaEncoding: 'ieee-p1363' }, k.sig);
  } catch (e) { good = false; }
  if (!good) return { ok: false, reason: 'signature' };
  if (!checkPayload(k.payload)) return { ok: false, reason: 'format' };
  if (k.payload.exp && (now || today()) > k.payload.exp) return { ok: false, reason: 'expired', payload: k.payload };
  if ((revoked || []).includes(k.payload.id)) return { ok: false, reason: 'revoked', payload: k.payload };
  return { ok: true, payload: k.payload };
}
function signKey(privatePem, fields) {
  const p = { v: 1, id: fields.id || newId(), tier: fields.tier || 'pro', iat: fields.iat || today() };
  if (fields.exp) p.exp = fields.exp;
  if (fields.name) p.name = fields.name;
  if (!checkPayload(p)) throw new Error('invalid payload ' + JSON.stringify(p));
  const pb64 = b64u(JSON.stringify(p));
  const sig = crypto.sign('sha256', Buffer.from('AOM1.' + pb64, 'ascii'), { key: crypto.createPrivateKey(privatePem), dsaEncoding: 'ieee-p1363' });
  return 'AOM1-' + pb64 + '.' + b64u(sig);
}
function fingerprint(jwk) { return crypto.createHash('sha256').update(Buffer.concat([Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])).digest('hex').slice(0, 16); }

function args(argv) { // --flag value | --flag (boolean) | positional
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) o[a.slice(2)] = true; else { o[a.slice(2)] = n; i++; } } else o._.push(a);
  }
  return o;
}
function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }

function main(argv) {
  const cmd = argv[0], o = args(argv.slice(1));
  if (cmd === 'keygen') {
    const dir = typeof o.out === 'string' ? path.resolve(o.out) : DEF_DIR, priv = path.join(dir, 'license-private.pem');
    const pubPath = typeof o.pub === 'string' ? path.resolve(o.pub) : PUB_PATH;   // --pub is for tests only
    if (!o.force && fs.existsSync(priv)) fail(priv + ' exists already. Overwriting it would invalidate every key you have issued. Use --force only if you are sure.');
    if (!o.force && fs.existsSync(pubPath)) fail(pubPath + ' exists already (replacing it invalidates all issued keys). Use --force only if you are sure.');
    fs.mkdirSync(dir, { recursive: true });
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const j = publicKey.export({ format: 'jwk' });
    const jwk = { kty: j.kty, crv: j.crv, x: j.x, y: j.y };
    fs.writeFileSync(pubPath, JSON.stringify(jwk) + '\n');
    console.log('Public key written to ' + pubPath + ' (commit it, then rebuild: python assemble.py)');
    console.log('Public key fingerprint: ' + fingerprint(jwk));
    console.log('Private key written to ' + priv);
    console.log('');
    console.log('!!! BACK UP THE PRIVATE KEY NOW (password manager / encrypted USB stick). If it is lost you can never issue');
    console.log('!!! a key that the published app accepts; if it leaks, anyone can mint licences. NEVER commit it, never paste it into a chat.');
  } else if (cmd === 'sign') {
    const keyPath = typeof o.key === 'string' ? path.resolve(o.key) : path.join(DEF_DIR, 'license-private.pem');
    if (!fs.existsSync(keyPath)) fail('private key not found at ' + keyPath + ' (run keygen first, or pass --key <path>)');
    const f = {};
    if (o.name !== undefined) { if (typeof o.name !== 'string' || !o.name.trim()) fail('--name needs a value'); f.name = o.name.trim(); if (f.name.length > 40 || /[\u0000-\u001f\u007f]/.test(f.name)) fail('--name must be at most 40 characters without control characters'); }
    if (o.exp !== undefined) { if (!isDate(o.exp)) fail('--exp must be a date YYYY-MM-DD'); f.exp = o.exp; }
    if (o.tier !== undefined) { if (!TIERS.includes(o.tier)) fail('--tier must be one of ' + TIERS.join(', ')); f.tier = o.tier; }
    if (f.exp && f.exp < today()) fail('--exp is in the past');
    const key = signKey(fs.readFileSync(keyPath, 'utf8'), f);
    console.log(key);
    const p = parseKey(key).payload;
    console.error('licence id ' + p.id + ', tier ' + p.tier + ', issued ' + p.iat + (p.exp ? ', until ' + p.exp : ', no expiry') + (p.name ? ', name ' + JSON.stringify(p.name) : ''));
    console.error('Record the id (and who bought it) in your own list; you need the id to revoke it.');
  } else if (cmd === 'verify') {
    if (!o._[0]) fail('usage: node tools/license.js verify <key> [--pub <public.jwk>]');
    const pubPath = typeof o.pub === 'string' ? path.resolve(o.pub) : PUB_PATH;
    if (!fs.existsSync(pubPath)) fail('public key not found at ' + pubPath);
    const jwk = JSON.parse(fs.readFileSync(pubPath, 'utf8'));
    const r = verifyKey(o._.join(''), jwk, loadRevoked(typeof o.rev === 'string' ? path.resolve(o.rev) : REV_PATH));
    if (r.ok) { console.log('VALID ' + JSON.stringify(r.payload)); } else { console.log('INVALID: ' + r.reason + (r.payload ? ' ' + JSON.stringify(r.payload) : '')); process.exit(1); }
  } else {
    console.error('Usage:\n  node tools/license.js keygen [--out <dir>] [--force]\n  node tools/license.js sign [--name "..."] [--exp YYYY-MM-DD] [--tier pro] [--key <private.pem>]\n  node tools/license.js verify <key> [--pub <public.jwk>]');
    process.exit(cmd ? 1 : 0);
  }
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { parseKey, verifyKey, signKey, newId, fingerprint, isDate };
