
// Utils for dealing with the SillyTavern API 

let cachedToken: string | null = null // CSRF token cache.

// if we don't have a cached token we ask SillyTavern for one.
export async function getCsrfToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    const res =  await fetch('/csrf-token');
    if (!res.ok) throw new Error("Can't obtain CSRF token");

    const data = await res.json()
    const token = data.token;
    cachedToken = token;
    return token;
}

// Function to call a specific endpoint of the backend without all the boilerplate code. Less spaghetti = happy
export async function callBackend(endpoint: string, options: RequestInit = {}) {
    const base_URL = "/api/plugins/ANPC"
    const token = await getCsrfToken();

    // Request headers, default + per-request headers
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
        ...options.headers
    };

    const url = `${base_URL}/${endpoint}`
    return fetch(url, {
        ...options,
        headers
    })
}