// Pure logic for the site's scripts. No DOM and no globals, so Node can test it.

export const SUBMIT_URL = "https://api.web3forms.com/submit";

/** The JSON body Web3Forms expects for a beta request. */
export function buildPayload({ accessKey, email, phone, where, news, botcheck, now }) {
  const payload = {
    access_key: accessKey,
    subject: "Dorf beta request",
    from_name: "lanternrot.com",
    email: email.trim(),
    phone: phone.trim(),
    where: where.trim(),
    news: news ? "yes" : "no",
  };
  if (news) payload.news_opt_in_at = now.toISOString();
  if (botcheck) payload.botcheck = true;
  return payload;
}

/** True while the access key is missing or still the "paste it here" stand-in. */
export function isPlaceholderKey(key) {
  if (typeof key !== "string") return true;
  const trimmed = key.trim();
  return trimmed === "" || /^paste[-_ ]/i.test(trimmed);
}

/**
 * Reads a Web3Forms reply. Success needs a 2xx status and a body whose
 * `success` is exactly true; everything else is a failure with a reason
 * fit for the console.
 */
export function interpretResponse(status, bodyText) {
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = undefined;
  }
  const isObject = body !== null && typeof body === "object";
  const message = isObject && typeof body.message === "string" && body.message ? body.message : "no message given";
  if (status < 200 || status > 299) {
    return { ok: false, kind: "http", reason: `Web3Forms answered HTTP ${status} (${message})` };
  }
  if (!isObject) {
    return { ok: false, kind: "bad-response", reason: `Web3Forms sent a reply that is not a JSON object (HTTP ${status})` };
  }
  if (body.success === true) return { ok: true };
  return { ok: false, kind: "rejected", reason: `Web3Forms said success: false (${message})` };
}

/**
 * Sends a beta request. Resolves to `{ ok: true }` or
 * `{ ok: false, kind, reason }`; it never throws and never claims success it
 * didn't see. `kind` is one of not-connected, network, http, bad-response,
 * rejected, so the page can word the error and the console gets `reason`.
 */
export async function submitBeta({ fetchImpl, accessKey, now, ...answers }) {
  if (isPlaceholderKey(accessKey)) {
    return {
      ok: false,
      kind: "not-connected",
      reason: "The Web3Forms access key is still the placeholder in _config.yml, so nothing was sent",
    };
  }
  try {
    const response = await fetchImpl(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(buildPayload({ accessKey, now, ...answers })),
    });
    return interpretResponse(response.status, await response.text());
  } catch (error) {
    return { ok: false, kind: "network", reason: `Could not reach Web3Forms: ${error.message}` };
  }
}

const VERSION = /^v?(\d{1,6}\.\d{1,6}\.\d{1,6}(?:[-+][0-9A-Za-z.-]{1,32})?)$/;

/** The version in a fetched version.txt, or null when it isn't one. */
export function parseVersion(text) {
  if (typeof text !== "string") return null;
  const match = VERSION.exec(text.trim());
  return match ? match[1] : null;
}

/**
 * What the hero chip says, as pieces so the version can be styled apart:
 * "Dorf 4.9.0 · Latest: {title}", or just "Latest: {title}" with no version.
 */
export function chipSegments(version, title) {
  const latest = { text: `Latest: ${title}` };
  return version ? [{ text: `Dorf ${version} · `, version: true }, latest] : [latest];
}
