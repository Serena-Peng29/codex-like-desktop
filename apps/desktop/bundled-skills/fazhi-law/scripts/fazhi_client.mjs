// fazhi_client.mjs - HTTP client for Fazhi Law API
import { getApiKey, BASE_URL } from "./fazhi_env.mjs";

async function request(path, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "FAZHI_LAW_API_KEY is not set. Ask the user for their API Key (from https://open.kuaicha365.com/lawskills/) and set it via the FAZHI_LAW_API_KEY environment variable before retrying."
    );
  }

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "open-authorization": `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => ({ error: "non-JSON response" }));
  if (!res.ok) {
    throw new Error(
      `Fazhi API error ${res.status}: ${JSON.stringify(body)}`
    );
  }
  return body;
}

/** Semantic search for law articles */
export async function searchLaw(query) {
  if (!query) {
    throw new Error("Query is required for law search");
  }
  const encodedQuery = encodeURIComponent(query);
  return request(`/v1/mcp/law_search/search_article?query=${encodedQuery}`);
}

/** Exact lookup of a law article by title and number */
export async function getArticle(title, number) {
  if (!title || !number) {
    throw new Error("title and number are required for article lookup");
  }
  const params = new URLSearchParams({ title, number }).toString();
  return request(`/v1/mcp/law_search/get_article?${params}`);
}

/** Semantic search for judicial cases */
export async function searchCase(query) {
  if (!query) {
    throw new Error("Query is required for case search");
  }
  const encodedQuery = encodeURIComponent(query);
  return request(`/v1/mcp/case_search/search_case?query=${encodedQuery}`);
}