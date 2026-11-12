# 01 — Sign-in, tokens and single sign-on

*Code: `server/auth/token.js`, `server/auth/secrets.js`, `server/auth/middleware.js`, `server/auth/routes.js`, `server/signaling/officeRooms.js` (`readTokenJoin`), `client/src/app/session.js`, `client/src/app/SignInPage.jsx`.*

---

## 1. What a person sees

1. On `#/signin` there are two tabs: **Employee** and **Admin**.
2. Employee tab: type an email (or click a demo chip such as `riya@infotact.demo`) → Continue.
3. Admin tab: email `admin@infotact.demo` plus the admin password.
4. Unknown email → the message "Not in the Infotact directory".
5. A note on the page says: "In production, identity comes from Infotact's dashboard (single sign-on). This demo looks you up in the employee directory."

**Single sign-on** (SSO) means signing in once, in one place (here: Infotact's own dashboard), and being trusted by every connected app without signing in again. It is **not built**; section 7 explains how it would plug in.

---

## 2. Why a token?

After sign-in, the browser makes many requests (`GET /api/me`, admin routes) and joins over Socket.io. Asking for the email every time would be silly, and the server must be sure the browser isn't lying about who it is.

So the server gives the browser a **token**: a short text pass the browser sends back with every request. The server must be able to tell a real pass from a home-made one, without a database lookup. That is what the signature does.

---

## 3. The token, step by step

### What is signed

The token has two parts joined by a dot:

```
<payload>.<signature>
```

- The **payload** is the facts: `{ sub, role, admin, exp }`.
  - `sub` ("subject"): the employee id, e.g. `emp-riya`.
  - `role`: the directory role, e.g. `lead`.
  - `admin`: `true` only for a token from the Admin tab.
  - `exp`: the expiry time in milliseconds since 1970 (`Date.now() + 12 h`).
- The payload is turned into JSON, then into **base64url** (a way to write any bytes using only letters, digits, `-` and `_`, so it is safe inside a web address or header).
- The **signature** is `HMAC-SHA256(AUTH_SECRET, payloadPart)`, also as base64url.

**HMAC-SHA256** is a "keyed fingerprint": you feed it a secret key and a message, and it gives back 32 bytes. Without the key you can't compute the right bytes; change one letter of the message and the result changes completely. **`AUTH_SECRET`** is that key. It lives only on the server (the `.env` file on a laptop, the Environment page on Render).

### A real example

Made with a throwaway secret (`example-secret-not-real`, never used anywhere) for Riya, expiring 13 Nov 2026 20:00 UTC:

```
eyJzdWIiOiJlbXAtcml5YSIsInJvbGUiOiJsZWFkIiwiYWRtaW4iOmZhbHNlLCJleHAiOjE3OTQ2MDAwMDAwMDB9.ZRbxEClDs1KsXuB03UauOPX-H-z7xzCMXbIFpoy2YS4
└──────────────────────────── payload (base64url JSON) ────────────────────────────┘ └──────── signature ────────┘
```

Decoding the first part gives back `{"sub":"emp-riya","role":"lead","admin":false,"exp":1794600000000}`. Anyone can do that decoding: the token is **signed, not encrypted**. That's fine, because nothing in it is secret. What nobody can do is *change* it.

### Making a token (`createToken`)

```js
// server/auth/token.js
export function createToken(claims, secret, ttlMs) {
  const payload = { ...claims, exp: Date.now() + ttlMs };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  return `${payloadPart}.${sign(payloadPart, secret)}`;
}
```

1. Add `exp` = now + `TOKEN_TTL_MS` (12 h = 43 200 000 ms).
2. JSON → base64url → `payloadPart`.
3. `sign(payloadPart)` = HMAC-SHA256 with the secret → base64url.
4. Join with a dot.

### Checking a token (`verifyToken`)

1. Not a string, or not exactly two parts → refuse (`null`).
2. Recompute the signature of the payload part with our own secret.
3. Compare it with the signature part using `timingSafeEqual`. Different length or different bytes → refuse.
4. Decode and parse the payload. Broken JSON → refuse.
5. `exp` missing or in the past → refuse (expired).
6. Otherwise return the payload.

```js
// server/auth/token.js, step 3
const expected = Buffer.from(sign(payloadPart, secret));
const given = Buffer.from(signaturePart);
if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
```

**`timingSafeEqual`** compares two byte lists in the same time whether they differ in the first byte or the last. A normal comparison stops early, so an attacker timing many guesses could learn the signature byte by byte.

### How tampering is caught: a worked example

Riya edits her token to make herself admin: `"admin":false` → `"admin":true`.

1. Her new payload part is `eyJzdWIiOiJlbXAtcml5YSIsInJvbGUiOiJsZWFkIiwiYWRtaW4iOnRydWUsImV4cCI6MTc5NDYwMDAwMDAwMH0`.
2. She keeps the old signature `ZRbxEClD…` because she can't compute a new one without the secret.
3. The server recomputes HMAC of the new payload: `alVMPsPY…`. That is not `ZRbxEClD…`.
4. `verifyToken` returns `null`. On a web route the answer is 401; on a Socket.io join the answer is `server:error` `BAD_TOKEN`.

The robot test `server/scripts/auth-test.js` does this ("join with a forged token → BAD_TOKEN").

### Expiry

`exp` is inside the signed payload, so it can't be pushed later either. After 12 hours `verifyToken` refuses the token and the person signs in again.

### One more check after the signature

`authenticate(token)` (`server/auth/middleware.js`) also looks the employee up: `getEmployee(claims.sub)`. A valid signature for an employee who has since been removed is refused too.

---

## 4. `AUTH_SECRET` and `ADMIN_PASSWORD`

Both come only from the environment, read when first needed (`server/auth/secrets.js`).

| Setting | If set | If missing |
|---|---|---|
| `AUTH_SECRET` | Tokens survive server restarts | The server makes a random 32-byte secret for this run and warns. Every restart signs everyone out (old signatures no longer match). |
| `ADMIN_PASSWORD` | Admin sign-in works with that password | Admin sign-in is refused with "Admin sign-in is switched off" |

How the admin password is compared:

```js
// server/auth/secrets.js
const expected = createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
const actual = createHash('sha256').update(given).digest();
return timingSafeEqual(expected, actual);
```

Why hash first? `timingSafeEqual` needs two inputs of the same length. A **SHA-256 hash** (a fixed 32-byte fingerprint of any text) of both sides always has the same length, so the comparison works for any guess and still takes constant time.

---

## 5. Who may do what

| Token from | `admin` flag | May call | Middleware |
|---|---|---|---|
| Employee tab | `false` (always, even for the admin person) | `/api/me`, `/api/office/floors/:id`, join the office | `requireEmployee` |
| Admin tab | `true` | everything above + `/api/admin/*`, `GET /api/rooms`, layout upload | `requireAdmin` |

**Middleware** is a small function Express runs before a route's own code; it either calls `next()` to let the request through or answers itself.

`requireAdmin` checks two things on the server:

```js
// server/auth/middleware.js
if (result.claims.admin !== true || result.employee.role !== ROLES.ADMIN) {
  res.status(403).json({ error: 'Only an admin can do this. …' });
```

1. The token was made by the Admin tab (`admin: true`).
2. The employee's role in the directory is **still** `admin` right now.

No token → 401 ("please sign in"). A valid employee token on an admin route → 403 ("not allowed"). The admin page hiding buttons is only convenience; the server checks every call.

The admin sign-in gives the same message for "unknown email", "not an admin" and "wrong password" (`Wrong admin email or password.`), so the form can't be used to discover which emails are admins.

---

## 6. The token in the browser and on join

1. The sign-in page stores the token in **sessionStorage** (a small store the browser keeps per tab until the tab closes). Every read and write is in `try/catch`, because private windows can throw. Show: `client/src/app/session.js`.
2. REST calls send it as a header: `Authorization: Bearer <token>`.
3. Joining the office sends it in the Socket.io event: `player:join { token, avatarColor }`.
4. The server runs `readTokenJoin` (`server/signaling/officeRooms.js`): `authenticate(token)` → the employee → their floor (or the `floorId` asked for after a reconnect, if that floor exists) → the name, role and department come from the directory, never from the browser.
5. Spawn: the lobby on your own floor, the elevator on another floor.

Why the token is sent again on join: a Socket.io connection is separate from the REST calls, so it has to prove who it is too.

---

## 7. How this becomes single sign-on (design, not built)

Today the "who are you?" step is: type an email that is in the directory. That is the only part that is a demo shortcut. Everything after it (signed token, expiry, server-side checks, floors from the directory) is real.

With SSO from Infotact's dashboard:

```
 Infotact dashboard ──(signed statement: "this is riya@…", short expiry)──► ProxiSpeak server
                                                                                │ verify with Infotact's key
                                                                                ▼
                                                               createToken({ sub: 'emp-riya', … })
                                                                                │
 browser ◄──────────────────────── our own 12 h token, exactly as today ───────┘
```

In words: the dashboard, which already knows who is signed in, vouches for the person with a signed message; our server checks that message with Infotact's key instead of trusting a typed email, and then issues our own token as now.

The steps:

1. Riya is signed in to the Infotact dashboard and clicks "Open ProxiSpeak".
2. The dashboard sends her browser to ProxiSpeak with a short-lived signed statement about her. In industry this is usually **OpenID Connect** (a standard where the identity provider signs an "ID token" about the user) or **SAML** (an older XML-based standard).
3. A new route on our server (for example `POST /api/auth/sso`, not written) verifies that statement with Infotact's public key or shared secret, checks its expiry and its intended audience (ProxiSpeak), and reads the email.
4. The route looks the email up in the directory (in production the directory itself would be synced from Infotact's HR system; see `server/office/seedData.js`) and calls the same `createToken(...)`.
5. From here on nothing changes: `requireEmployee`, `requireAdmin`, `readTokenJoin` all work as today.

What would also improve: admin rights from a group in the SSO statement instead of a shared `ADMIN_PASSWORD`, and shorter tokens with refresh, so a copied token stops working sooner.

---

## 8. Known limits (say them before the examiner does)

1. **No employee password.** Anyone who knows a directory email can sign in as that person. Demo only.
2. **Stateless tokens.** "Sign out" only clears the tab; a copied token works until it expires (12 h). No revoke list.
3. **One shared admin password**, not per-person admin accounts.
4. **The token travels in plain sight** over HTTPS headers and the Socket.io join; on Render both are HTTPS/WSS (encrypted in transit), locally they are plain HTTP.

Tests: `server/scripts/auth-test.js` (unknown email → 404, token → `/api/me`, token join → directory name and floor, forged token → `BAD_TOKEN`, wrong admin password → 401, employee token on admin → 403, no token → 401, admin token → overview 200).
