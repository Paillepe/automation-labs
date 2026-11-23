// HTTP vu d'un check, depuis le devcontainer (réseau usine) : délai court, jamais d'exception.
// Résultat : { ok, status, body, json } ou { ok: false, error } quand rien ne répond.
export async function get(url, { timeout = 3000, headers = {}, method = 'GET', body } = {}) {
  try {
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // pas du JSON : on garde le texte
    }
    return { ok: response.ok, status: response.status, body: text, json };
  } catch (error) {
    const cause = error?.cause?.code ?? error?.name ?? 'erreur';
    return { ok: false, status: null, error: cause === 'TimeoutError' ? `aucune réponse en ${timeout / 1000} s` : cause };
  }
}

// « 200 », « 503 », ou « rien (ECONNREFUSED) » : ce qu'on a constaté, dit en une expression.
export const seen = (r) => (r.status ? `HTTP ${r.status}` : `aucune réponse (${r.error})`);
