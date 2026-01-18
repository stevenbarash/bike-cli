import { promises as fs } from "fs";
import path from "path";
import os from "os";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_LOCATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getCacheDir = () => path.join(os.homedir(), ".cache", "bike-cli");

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const buildKey = ({ latitude, longitude, units }) => {
  const lat = Number(latitude).toFixed(3);
  const lon = Number(longitude).toFixed(3);
  return `weather_${lat}_${lon}_${units}.json`;
};

const buildLocationKey = (query) => {
  const normalized = String(query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `location_${normalized || "unknown"}.json`;
};

export const loadCache = async ({ latitude, longitude, units, ttlMs }) => {
  const cacheDir = getCacheDir();
  const fileName = buildKey({ latitude, longitude, units });
  const filePath = path.join(cacheDir, fileName);

  try {
    const contents = await fs.readFile(filePath, "utf-8");
    const payload = JSON.parse(contents);
    const age = Date.now() - payload.timestamp;

    if (age > (ttlMs ?? DEFAULT_TTL_MS)) {
      return { hit: false };
    }

    return { hit: true, data: payload.data };
  } catch (error) {
    return { hit: false };
  }
};

export const getCacheDefaults = () => ({ ttlMs: DEFAULT_TTL_MS });

export const loadLocationCache = async ({ query, ttlMs }) => {
  const cacheDir = getCacheDir();
  const fileName = buildLocationKey(query);
  const filePath = path.join(cacheDir, fileName);

  try {
    const contents = await fs.readFile(filePath, "utf-8");
    const payload = JSON.parse(contents);
    const age = Date.now() - payload.timestamp;

    if (age > (ttlMs ?? DEFAULT_LOCATION_TTL_MS)) {
      return { hit: false };
    }

    return { hit: true, data: payload.data };
  } catch (error) {
    return { hit: false };
  }
};

export const saveLocationCache = async ({ query, data }) => {
  const cacheDir = getCacheDir();
  await ensureDir(cacheDir);

  const fileName = buildLocationKey(query);
  const filePath = path.join(cacheDir, fileName);
  const payload = JSON.stringify({ timestamp: Date.now(), data });

  await fs.writeFile(filePath, payload, "utf-8");
};

export const saveCache = async ({ latitude, longitude, units, data }) => {
  const cacheDir = getCacheDir();
  await ensureDir(cacheDir);

  const fileName = buildKey({ latitude, longitude, units });
  const filePath = path.join(cacheDir, fileName);
  const payload = JSON.stringify({ timestamp: Date.now(), data });

  await fs.writeFile(filePath, payload, "utf-8");
};
