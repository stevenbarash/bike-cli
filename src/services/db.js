import { promises as fs } from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".config", "bike-cli");
const DATA_FILE = path.join(CONFIG_DIR, "data.json");

const ensureDir = async () => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
};

export const initializeData = async () => {
  await ensureDir();

  try {
    await fs.readFile(DATA_FILE);
  } catch {
    const initialData = {
      meta: { version: "001", createdAt: new Date().toISOString() },
      stravaTokens: [],
      bikes: [],
      activities: [],
      components: [],
      maintenanceEvents: [],
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
};

export const loadData = async () => {
  await ensureDir();

  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    await initializeData();
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  }
};

export const saveData = async (data) => {
  await ensureDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
};

export const upsertStravaToken = (data, athleteId, accessToken, refreshToken, expiresAt, scopes) => {
  const existingIndex = data.stravaTokens.findIndex((t) => t.athleteId === athleteId);

  const token = {
    athleteId,
    accessToken,
    refreshToken,
    expiresAt,
    scopes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    data.stravaTokens[existingIndex] = token;
  } else {
    data.stravaTokens.push(token);
  }
};

export const getStravaToken = (data, athleteId) => {
  if (athleteId === null || athleteId === undefined) {
    if (!data.stravaTokens.length) {
      return null;
    }
    return data.stravaTokens.reduce((latest, token) => {
      if (!latest) {
        return token;
      }
      const latestTime = Date.parse(latest.updatedAt || latest.createdAt || "") || 0;
      const tokenTime = Date.parse(token.updatedAt || token.createdAt || "") || 0;
      return tokenTime >= latestTime ? token : latest;
    }, null);
  }

  return data.stravaTokens.find((t) => t.athleteId === athleteId) || null;
};

export const deleteStravaToken = (data, athleteId) => {
  data.stravaTokens = data.stravaTokens.filter((t) => t.athleteId !== athleteId);
};

export const upsertBike = (data, bike) => {
  const existingIndex = data.bikes.findIndex((b) => b.id === bike.id);

  const bikeRecord = {
    ...bike,
    createdAt: bike.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    data.bikes[existingIndex] = bikeRecord;
  } else {
    data.bikes.push(bikeRecord);
  }
};

export const getBikes = (data) => data.bikes.sort((a, b) => {
  if (a.isDefault !== b.isDefault) {
    return b.isDefault ? 1 : 0;
  }
  return a.name.localeCompare(b.name);
});

export const getBike = (data, id) => data.bikes.find((b) => b.id === id) || null;

export const getBikeByStravaGearId = (data, stravaGearId) => data.bikes.find((b) => b.stravaGearId === stravaGearId) || null;

export const getDefaultBike = (data) => data.bikes.find((b) => b.isDefault) || null;

export const setDefaultBike = (data, id) => {
  data.bikes = data.bikes.map((b) => ({
    ...b,
    isDefault: b.id === id,
  }));
};

export const deleteBike = (data, id) => {
  data.bikes = data.bikes.filter((b) => b.id !== id);
};

export const upsertActivity = (data, activity) => {
  const existingIndex = data.activities.findIndex((a) => a.id === activity.id);

  const activityRecord = {
    ...activity,
    createdAt: activity.createdAt || new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    data.activities[existingIndex] = activityRecord;
  } else {
    data.activities.push(activityRecord);
  }
};

export const getActivities = (data, options = {}) => {
  let { athleteId, bikeId, limit, since } = options;
  let filtered = data.activities;

  if (athleteId) {
    filtered = filtered.filter((a) => a.athleteId === athleteId);
  }

  if (bikeId) {
    filtered = filtered.filter((a) => a.bikeId === bikeId);
  }

  if (since) {
    const sinceDate = new Date(since);
    filtered = filtered.filter((a) => new Date(a.startDate) >= sinceDate);
  }

  filtered = filtered.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  if (limit) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
};

export const getActivityStats = (data, bikeId, since) => {
  let filtered = data.activities;

  if (bikeId) {
    filtered = filtered.filter((a) => a.bikeId === bikeId);
  }

  if (since) {
    const sinceDate = new Date(since);
    filtered = filtered.filter((a) => new Date(a.startDate) >= sinceDate);
  }

  const count = filtered.length;
  const totalDistanceM = filtered.reduce((sum, a) => sum + a.distanceM, 0);
  const totalTimeS = filtered.reduce((sum, a) => sum + a.movingTimeS, 0);
  const totalElevGainM = filtered.reduce((sum, a) => sum + (a.elevGainM || 0), 0);

  return { count, totalDistanceM, totalTimeS, totalElevGainM };
};

export const upsertComponent = (data, component) => {
  const existingIndex = data.components.findIndex((c) => c.id === component.id);

  const componentRecord = {
    ...component,
    createdAt: component.createdAt || new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    data.components[existingIndex] = componentRecord;
  } else {
    data.components.push(componentRecord);
  }
};

export const getComponents = (data, bikeId) => data.components.filter((c) => c.bikeId === bikeId).sort((a, b) => a.name.localeCompare(b.name));

export const addMaintenanceEvent = (data, event) => {
  const eventRecord = {
    ...event,
    createdAt: new Date().toISOString(),
  };
  data.maintenanceEvents.unshift(eventRecord);
};

export const getMaintenanceEvents = (data, bikeId, since) => {
  let filtered = data.maintenanceEvents;

  if (bikeId) {
    filtered = filtered.filter((e) => e.bikeId === bikeId);
  }

  if (since) {
    const sinceDate = new Date(since);
    filtered = filtered.filter((e) => new Date(e.occurredAt) >= sinceDate);
  }

  return filtered.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
};

export const modifyData = async (modifier) => {
  const data = await loadData();
  await modifier(data);
  await saveData(data);
  return data;
};
