// Pure logic for the site's scripts. No DOM and no globals, so Node can test it.

export const SUBMIT_URL = "https://api.web3forms.com/submit";

/** The fields every request carries; the subject is what tells them apart in the inbox. */
function basePayload({ accessKey, subject, email, botcheck }) {
  const payload = {
    access_key: accessKey,
    subject,
    from_name: "lanternrot.com",
    email: email.trim(),
  };
  if (botcheck) payload.botcheck = true;
  return payload;
}

/** The JSON body Web3Forms expects for a beta request. */
export function buildPayload({ accessKey, email, phone, where, news, botcheck, now }) {
  const payload = {
    ...basePayload({ accessKey, subject: "Dorf beta request", email, botcheck }),
    phone: phone.trim(),
    where: where.trim(),
    news: news ? "yes" : "no",
  };
  if (news) payload.news_opt_in_at = now.toISOString();
  return payload;
}

/** The JSON body Web3Forms expects for a chat game request. */
export function buildChatGamePayload({ accessKey, email, channel, idea, botcheck }) {
  return {
    ...basePayload({ accessKey, subject: "Chat game request", email, botcheck }),
    channel: channel.trim(),
    idea: idea.trim(),
  };
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
 * Sends a request built by `buildBody`. Resolves to `{ ok: true }` or
 * `{ ok: false, kind, reason }`; it never throws and never claims success it
 * didn't see. `kind` is one of not-connected, network, http, bad-response,
 * rejected, so the page can word the error and the console gets `reason`.
 */
async function submitRequest(buildBody, { fetchImpl, accessKey, ...answers }) {
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
      body: JSON.stringify(buildBody({ accessKey, ...answers })),
    });
    return interpretResponse(response.status, await response.text());
  } catch (error) {
    return { ok: false, kind: "network", reason: `Could not reach Web3Forms: ${error.message}` };
  }
}

/** Sends a beta request (see submitRequest for the result shape). */
export const submitBeta = args => submitRequest(buildPayload, args);

/** Sends a chat game request (see submitRequest for the result shape). */
export const submitChatGameRequest = args => submitRequest(buildChatGamePayload, args);

const VERSION = /^v?(\d{1,6}\.\d{1,6}\.\d{1,6}(?:[-+][0-9A-Za-z.-]{1,32})?)$/;

/** The version in a fetched version.txt, or null when it isn't one. */
export function parseVersion(text) {
  if (typeof text !== "string") return null;
  const match = VERSION.exec(text.trim());
  return match ? match[1] : null;
}

/**
 * What the hero chip says, as pieces so the version can be styled apart.
 *
 * - Version live and the latest post is that version's release
 *   ("Dorf 4.9.0: rivals…"): "Dorf 4.9.0 is out · Rivals…"
 * - Version live, latest post is about something else: "Dorf 4.9.0 · Latest: {title}"
 * - No version: "Latest: {title}"
 */
export function chipSegments(version, title) {
  if (!version) return [{ text: `Latest: ${title}` }];
  const lead = { text: `Dorf ${version}`, version: true };
  const prefix = `Dorf ${version}:`;
  const headline = title.startsWith(prefix) ? title.slice(prefix.length).trim() : "";
  if (headline) {
    return [lead, { text: ` is out · ${headline[0].toUpperCase()}${headline.slice(1)}` }];
  }
  return [lead, { text: ` · Latest: ${title}` }];
}

const KEPT = "Your answers are still filled in";

/** What the visitor reads when a request didn't go through. */
export function errorMessage(kind) {
  switch (kind) {
    case "not-connected":
      return `This form isn't connected yet, so nothing was sent. ${KEPT}.`;
    case "rejected":
      return `The form service turned the request down. ${KEPT}, so check them and try again.`;
    default:
      return `The form service didn't answer. ${KEPT}, so try again in a minute.`;
  }
}
