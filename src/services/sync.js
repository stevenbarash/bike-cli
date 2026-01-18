import {
  modifyData,
  loadData,
  upsertBike,
  upsertActivity,
  getBikes,
  getActivityStats,
} from "./db.js";
import { createStravaClient } from "./strava.js";
import { loadConfig } from "./config.js";
import crypto from "crypto";

const generateId = () => crypto.randomUUID();

export const syncBikes = async ({ stravaClient, athleteId }) => {
  const gears = await stravaClient.getGears();
  const bikes = gears.filter((g) => g.resource_state === 3 && g.gear_id);
  const shoes = gears.filter((g) => g.resource_state === 3 && !g.gear_id);

  await modifyData(async (data) => {
    for (const bike of bikes) {
      const existing = data.bikes.find((b) => b.stravaGearId === bike.gear_id);
      const bikeId = existing?.id || generateId();

      upsertBike(data, {
        id: bikeId,
        name: bike.name || bike.nickname || "Unnamed Bike",
        type: bike.description || null,
        stravaGearId: bike.gear_id,
        isDefault: existing?.isDefault || false,
        notes: bike.brand_model || null,
      });
    }
  });

  return { bikesCount: bikes.length, shoesCount: shoes.length };
};

export const syncActivities = async ({
  stravaClient,
  athleteId,
  since,
  full = false,
}) => {
  const sinceDate = since
    ? new Date(since)
    : full
    ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000);
  let added = 0;
  let updated = 0;
  let page = 1;
  const perPage = 200;

  await modifyData(async (data) => {
    while (true) {
      const activities = await stravaClient.getActivities({
        after: sinceTimestamp,
        perPage,
        page,
      });

      if (!activities || activities.length === 0) {
        break;
      }

      for (const activity of activities) {
        let bikeId = null;
        if (activity.gear_id) {
          const bike = data.bikes.find((b) => b.stravaGearId === activity.gear_id);
          if (bike) {
            bikeId = bike.id;
          }
        }

        const activityData = {
          id: activity.id,
          athleteId,
          bikeId,
          stravaGearId: activity.gear_id || null,
          startDate: activity.start_date,
          distanceM: activity.distance || 0,
          movingTimeS: activity.moving_time || 0,
          elapsedTimeS: activity.elapsed_time || 0,
          elevGainM: activity.total_elevation_gain || 0,
          averageSpeedMps: activity.average_speed || 0,
          type: activity.type || null,
          rawJson: JSON.stringify(activity),
        };

        const existingActivity = data.activities.find((a) => a.id === activity.id);

        if (existingActivity) {
          updated++;
        } else {
          added++;
        }

        data.activities.push(activityData);
      }

      if (activities.length < perPage) {
        break;
      }

      page++;
    }
  });

  return { added, updated };
};

export const sync = async (options = {}) => {
  const { since, full } = options;

  try {
    const stravaClient = await createStravaClient();

    await stravaClient.loadFromDb();

    const { athleteId, name, city, state, country, scopes } =
      await stravaClient.authorize();

    const bikesResult = await syncBikes({
      stravaClient,
      athleteId,
    });

    const activitiesResult = await syncActivities({
      stravaClient,
      athleteId,
      since,
      full,
    });

    return {
      athlete: { id: athleteId, name, city, state, country, scopes },
      bikes: bikesResult,
      activities: activitiesResult,
      since,
    };
  } catch (error) {
    throw new Error(`Sync failed: ${error.message}`);
  }
};
