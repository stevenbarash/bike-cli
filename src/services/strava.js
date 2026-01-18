import http from "http";
import { modifyData, loadData, getStravaToken, upsertStravaToken } from "./db.js";
import { getStravaCredentials, loadConfig } from "./config.js";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_URL = "https://www.strava.com/api/v3";
const SCOPES = "activity:read_all,read";

const SCOPES_ARRAY = SCOPES.split(",");

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava API error: ${response.status} ${error}`);
  }
  return response.json();
};

const buildAuthorizeUrl = ({ clientId, redirectUri }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPES,
  });
  return `${STRAVA_AUTH_URL}?${params}`;
};

const exchangeCodeForToken = async ({ clientId, clientSecret, code }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });

  const response = await fetchJson(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + response.expires_in,
    scopes: SCOPES,
  };
};

const refreshAccessToken = async ({ clientId, clientSecret, refreshToken }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetchJson(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + response.expires_in,
  };
};

const findOpenPort = async () => {
  const net = await import("net");

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
};

const createCallbackServer = (port, timeoutMs = 120000) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      const finish = (callback) => {
        clearTimeout(timeout);
        server.close(() => callback());
      };

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`OAuth error: ${error}`);
        finish(() => reject(new Error(`OAuth error: ${error}`)));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <head><title>Strava Auth Complete</title></head>
            <body>
              <h1>Authorization successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);
        finish(() => resolve(code));
        return;
      }

      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing authorization code");
      finish(() => reject(new Error("Missing authorization code")));
    });

    const timeout = setTimeout(() => {
      server.close(() => reject(new Error("Authorization timeout")));
    }, timeoutMs);

    server.listen(port, "127.0.0.1", (err) => {
      if (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    server.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

export class StravaClient {
  constructor(credentials) {
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.redirectUri = credentials.redirectUri;
    this.accessToken = null;
    this.expiresAt = null;
    this.athleteId = null;
  }

  async loadFromDb() {
    const data = await loadData();
    const token = getStravaToken(data, this.athleteId);

    if (!token) {
      throw new Error("No Strava token found. Run 'bike auth login' first.");
    }

    if (this.isTokenExpired(token)) {
      const refreshed = await refreshAccessToken({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: token.refreshToken,
      });

      await modifyData((data) => {
        upsertStravaToken(
          data,
          this.athleteId,
          refreshed.accessToken,
          refreshed.refreshToken,
          refreshed.expiresAt,
          refreshed.scopes
        );
      });

      this.accessToken = refreshed.accessToken;
      this.expiresAt = refreshed.expiresAt;
    } else {
      this.accessToken = token.accessToken;
      this.expiresAt = token.expiresAt;
    }
  }

  isTokenExpired(token) {
    return Math.floor(Date.now() / 1000) >= token.expires_at - 300;
  }

  async authorize() {
    const port = await findOpenPort();
    const localRedirectUri = `http://127.0.0.1:${port}/callback`;

    const url = buildAuthorizeUrl({
      clientId: this.clientId,
      redirectUri: localRedirectUri,
    });

    process.stdout.write(
      `Open this URL in your browser:\n${url}\n\nWaiting for callback...\n`
    );

    try {
      const code = await createCallbackServer(port);

      const tokens = await exchangeCodeForToken({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        code,
      });

      this.accessToken = tokens.accessToken;
      this.expiresAt = tokens.expiresAt;

      const athlete = await this.getAthlete();
      this.athleteId = athlete.id;

      await modifyData((data) => {
        upsertStravaToken(
          data,
          this.athleteId,
          tokens.accessToken,
          tokens.refreshToken,
          tokens.expiresAt,
          tokens.scopes
        );
      });

      return {
        athleteId: this.athleteId,
        name: athlete.firstname + " " + athlete.lastname,
        city: athlete.city,
        state: athlete.state,
        country: athlete.country,
        scopes: tokens.scopes,
      };
    } catch (error) {
      throw new Error(`Authorization failed: ${error.message}`);
    }
  }

  async ensureToken() {
    if (!this.accessToken || this.isTokenExpired({ expires_at: this.expiresAt })) {
      const data = await loadData();
      const token = getStravaToken(data, this.athleteId);

      if (!token) {
        throw new Error("No valid Strava token. Run 'bike auth login'.");
      }

      if (this.isTokenExpired(token)) {
        const refreshed = await refreshAccessToken({
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          refreshToken: token.refreshToken,
        });

        await modifyData((data) => {
          upsertStravaToken(
            data,
            this.athleteId,
            refreshed.accessToken,
            refreshed.refreshToken,
            refreshed.expiresAt,
            SCOPES
          );
        });

        this.accessToken = refreshed.accessToken;
        this.expiresAt = refreshed.expiresAt;
      } else {
        this.accessToken = token.accessToken;
        this.expiresAt = token.expiresAt;
      }
    }
  }

  async apiRequest(endpoint, params = {}) {
    await this.ensureToken();

    const url = new URL(`${STRAVA_API_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.accessToken = null;
        throw new Error("Session expired. Run 'bike auth login' again.");
      }
      const error = await response.text();
      throw new Error(`Strava API error (${response.status}): ${error}`);
    }

    const rateLimitLimit = response.headers.get("X-RateLimit-Limit");
    const rateLimitUsage = response.headers.get("X-RateLimit-Usage");
    if (rateLimitUsage && rateLimitLimit) {
      const usage = parseInt(rateLimitUsage, 10);
      const limit = parseInt(rateLimitLimit, 10);
      if (usage >= limit * 0.9) {
        process.stderr.write(
          `Warning: Approaching Strava rate limit (${usage}/${limit})\n`
        );
      }
    }

    return response.json();
  }

  async getAthlete() {
    return this.apiRequest("/athlete");
  }

  async getActivities(options = {}) {
    const {
      after = null,
      before = null,
      perPage = 200,
      page = 1,
    } = options;

    return this.apiRequest("/athlete/activities", {
      after,
      before,
      per_page: perPage,
      page,
    });
  }

  async getGears() {
    const athlete = await this.getAthlete();
    const bikes = athlete.bikes || [];
    const shoes = athlete.shoes || [];
    return [...bikes, ...shoes];
  }
}

export const createStravaClient = async () => {
  const config = await loadConfig();
  const credentials = getStravaCredentials(config);
  if (!credentials) {
    throw new Error(
      "Strava credentials not configured. Set them in config or env vars:\n  bike config set strava.clientId YOUR_ID\n  bike config set strava.clientSecret YOUR_SECRET\n\nOr use env vars: BIKE_STRAVA_CLIENT_ID, BIKE_STRAVA_CLIENT_SECRET"
    );
  }
  return new StravaClient(credentials);
};
