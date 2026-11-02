// Small API client on the browser's own fetch (no extra library: the portal is the
// first thing a customer's phone downloads, often on a slow connection).
// Same shape as before: answers come back as { data }, and a failed request throws
// an error with error.response = { status, data }, so error.response?.data?.error
// still holds the server's message.
const API_URL = import.meta.env.VITE_API_URL;
const TIMEOUT_MS = 20000; // a request that hangs fails with "Connection failed." instead of waiting forever

const request = async (method, path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON (for example an Nginx error page) */ }
    if (!res.ok) {
      const error = new Error(`Request failed with status ${res.status}`);
      error.response = { status: res.status, data };
      throw error;
    }
    return { data };
  } finally {
    clearTimeout(timer);
  }
};

const apiClient = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body)
};

export default apiClient;
