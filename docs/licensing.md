# Licence keys (Pro groundwork)

Status (v1.11): the scheme is in place, **nothing is locked yet**. The app can verify a licence key and knows whether it is "Pro", but every feature in `FEATURES` is still `pro:false`. This follows the decisions of 2026-10-08 in `release-brainstorm.md`: freemium, local-first, no server, no accounts, no personal data processed by us.

## How it works

A licence key is a small signed document:

```
AOM1-<base64url(payload JSON)>.<base64url(signature)>
```

- **Payload:** `{"v":1,"id":"<10 chars A-Z 2-7>","tier":"pro","iat":"YYYY-MM-DD","exp":"YYYY-MM-DD" (optional),"name":"..." (optional, max 40 characters)}`. No e-mail address, no other personal data. `name` is only a display name ("licensed to ..."); leave it out if the buyer prefers.
- **Signature:** ECDSA P-256 with SHA-256 over the ASCII text `"AOM1." + base64url(payload JSON)`, as raw `r || s` (64 bytes, the IEEE P1363 format that WebCrypto expects).
- **Public key:** `tools/license-public.jwk`, committed. `assemble.py` embeds it into `index.html` (placeholder `__LICPUB__`). The app checks keys with `crypto.subtle.verify`, entirely on the device. Nothing is sent anywhere.
- **Private key:** exists once, on your machine (`%USERPROFILE%\.atlas-of-motion\license-private.pem`). It is never committed (`.gitignore` has `*.pem` and `license-private*`).
- **Revocation list:** `tools/data/revoked.txt`, one licence id per line (`#` comments allowed). Embedded as `__LICREV__`. `lint.py` checks the id format.
- **Dates:** `exp` is the last valid day (inclusive), compared with the device's local date. A key without `exp` does not expire (lifetime).
- **In the app:** panel "Pro & licence" in the colophon at the bottom of the sidebar. Activate stores the key (whitespace removed) in `localStorage` `aom.lic.v1` only after it verified. On every start-up the key is verified again; if it no longer verifies (revoked, expired) the string stays stored but the app is "Free" and the panel shows the reason. `isPro()` is synchronous (last result), `hasFeature(name)` is the single gate to use later:

```js
const FEATURES = { stats: {pro: true, label: "Training statistics"}, ... };   // flip pro:false -> true to gate a feature
if (hasFeature("stats")) { ... }
```

Reasons shown: `format` (not an `AOM1-` key), `signature`, `expired`, `revoked`, `unsupported` (no `crypto.subtle`: an insecure `http://` page; use https or localhost).

## Threat model, in plain words

- The check runs in the user's browser, so a determined person can always bypass it (edit the script in DevTools, patch `isPro`, or share a key). **Offline keys in a web app are not copy-proof.** That is acceptable for a side project: the goal is a fair, low-friction "pay if you like it" gate, not DRM.
- What the signature does guarantee: nobody can *invent* a valid key without the private key, and nobody can change the payload (name, expiry, tier) of an existing key.
- A leaked key can be shared. Mitigation is limited to **revocation**, which only takes effect when the user loads a new app version (the list is part of `index.html`; the service worker fetches the page network-first, so online users get it quickly, offline users keep the old list).
- If the **private key leaks**, anyone can mint keys: generate a new pair (`keygen --force`), ship the new public key, and re-issue keys to paying customers. All old keys stop working. If the private key is **lost**, the same applies: back it up.
- The public key is not secret. Replacing it in a fork only affects that fork.

## One-time setup: generate and back up the key pair

```bash
node tools/license.js keygen
```

This writes the private key to `%USERPROFILE%\.atlas-of-motion\license-private.pem` (pass `--out <dir>` for another place), the public key to `tools/license-public.jwk`, and prints a fingerprint. It refuses to overwrite an existing key unless you pass `--force` (overwriting invalidates every key you have issued).

**Back up `license-private.pem` immediately** (password manager attachment, encrypted USB stick, a second encrypted location). Do not commit it, do not paste it into chat or e-mail. Then rebuild and commit the public key:

```bash
cd tools && python assemble.py        # embeds license-public.jwk
git add tools/license-public.jwk index.html sw.js
```

## Issue a key manually (today)

```bash
node tools/license.js sign --name "Ana Example" --exp 2027-10-08    # name and exp optional; no --exp = lifetime
node tools/license.js verify AOM1-...                                # check it against tools/license-public.jwk
```

`sign` prints the key on stdout and the licence id on stderr. **Keep a private list** (outside the repo) of id, date, buyer and order number: the id is the only handle you have to revoke a key later. Send the key to the buyer by the shop's mail or by hand.

## Revoke a key

1. Add the licence id to `tools/data/revoked.txt` (a comment with the reason helps: `ABCDEFGHIJ  # refunded 2027-01-15`).
2. `cd tools && python lint.py && python assemble.py`, run the tests, commit `index.html` and `sw.js` with it, push. Users see the change after their next page load (online); the panel then shows "This licence has been revoked."

## Automating issuing later

When sales start, a merchant of record (e.g. Paddle or Lemon Squeezy; they handle EU VAT and invoices) can call a webhook after each paid order. That webhook needs nothing but the private key and the sign function from `tools/license.js` (`signKey(privatePem, {name, exp})` returns the key string). A minimal flow:

1. The provider posts "order paid" to a small serverless function (Cloudflare Worker, Netlify/Vercel function). The function verifies the provider's webhook signature.
2. It signs a key with the private key (kept as a secret in the function's environment, not in the repo), picks `exp` from the product (subscription period or none for lifetime), and stores/sends the key through the provider's licence-key or e-mail feature. The provider's order id can be logged next to the licence id.
3. Refund or cancelled subscription: the same function appends the id to a revocation list. Because the list is embedded at build time, either rebuild on a schedule/trigger, or later move the list to a small signed JSON file fetched at start-up (with an offline fallback).

This keeps "no accounts, no personal data in the app": the buyer's data stays with the payment provider; the app only ever sees the signed key.

## Files

| File | Role |
|---|---|
| `tools/license.js` | CLI: `keygen`, `sign`, `verify` (Node built-in `crypto`, no packages) |
| `tools/license-public.jwk` | Public key (committed) |
| `tools/data/revoked.txt` | Revoked licence ids (committed) |
| `tools/assemble.py` | Injects `__LICPUB__` and `__LICREV__` into `template.html` |
| `tools/lint.py` | Validates the id format in `revoked.txt` and the public key file |
| `tools/template.html` | `licence` section: `parseKey`, `verifyKey`, `isPro`, `FEATURES`, `hasFeature`, panel |
| `tools/test/smoke.js` | `licenseRun()`: CLI round trip and the panel with a throw-away TEST key pair (never the real private key) |
