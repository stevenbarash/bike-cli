import { promises as fs } from "fs";
import os from "os";
import path from "path";

const DEFAULT_CONFIG = {
  location: "Brooklyn",
  units: "us",
  profile: "commuter",
  dbPath: null,
  defaultBikeId: null,
  strava: {
    clientId: null,
    clientSecret: null,
    redirectUri: "http://127.0.0.1:8888/callback",
  },
};

const getConfigDir = () => path.join(os.homedir(), ".config", "bike-cli");
const getConfigPath = () => path.join(getConfigDir(), "config.json");

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

export const loadConfig = async () => {
  const filePath = getConfigPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    return { ...DEFAULT_CONFIG };
  }
};

export const saveConfig = async (config) => {
  const dir = getConfigDir();
  await ensureDir(dir);
  const payload = JSON.stringify(config, null, 2);
  await fs.writeFile(getConfigPath(), payload, "utf-8");
};

export const updateConfig = async (updates) => {
  const current = await loadConfig();
  const next = { ...current, ...updates };
  await saveConfig(next);
  return next;
};

export const getConfigDefaults = () => ({ ...DEFAULT_CONFIG });

export const getEffectiveDbPath = (config) => {
  if (config.dbPath) {
    return config.dbPath;
  }
  return path.join(getConfigDir(), "bike.sqlite");
};

export const getStravaCredentials = (config) => {
  const clientId = config.strava?.clientId || process.env.BIKE_STRAVA_CLIENT_ID;
  const clientSecret = config.strava?.clientSecret || process.env.BIKE_STRAVA_CLIENT_SECRET;
  const redirectUri = config.strava?.redirectUri || "http://127.0.0.1:8888/callback";

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
};
