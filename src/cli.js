import { Command } from "commander";
import ora from "ora";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTheme } from "./theme.js";
import crypto from "crypto";
import path from "path";
import os from "os";
import {
  geocodeLocation,
  fetchWeather,
  describeWeatherCode,
} from "./services/openMeteo.js";
import {
  loadCache,
  saveCache,
  loadLocationCache,
  saveLocationCache,
} from "./services/cache.js";
import {
  loadConfig,
  updateConfig,
  saveConfig,
  getConfigDefaults,
  getEffectiveDbPath,
} from "./services/config.js";
import {
  initializeData,
  loadData,
  modifyData,
  getStravaToken,
  deleteStravaToken,
  getBikes,
  getBike,
  setDefaultBike,
  deleteBike,
  upsertBike,
  getActivityStats,
} from "./services/db.js";
import { createStravaClient } from "./services/strava.js";
import { sync } from "./services/sync.js";
import { getMaintenanceStatus, logMaintenance } from "./utils/maintenance.js";
import { buildRecommendationSummary, getTrainingRecommendation } from "./utils/training.js";
import { buildBikeTips } from "./utils/tips.js";
import {
  renderReport,
  renderChecklist,
  renderRouteSummary,
  renderJson,
  renderCsv,
  renderSyncResult,
  renderAuthStatus,
  renderBikesList,
  renderStats,
  renderTrainingSummary,
  renderTrainingRecommendation,
  renderMaintenanceStatus,
  renderConfigSummary,
  renderConfigChanges,
  renderConfigValue,
  renderHint,
  renderSectionHeader,
  toCardinalDirection,
} from "./utils/format.js";

const normalizeUnits = (units) => {
  const normalized = String(units ?? "us").toLowerCase();
  if (!["us", "metric"].includes(normalized)) {
    throw new Error("Units must be 'us' or 'metric'.");
  }
  return normalized;
};

const normalizeFormat = (format) => {
  const normalized = String(format ?? "text").toLowerCase();
  if (!["text", "json", "csv"].includes(normalized)) {
    throw new Error("Format must be 'text', 'json', or 'csv'.");
  }
  return normalized;
};

const normalizeTtl = (ttl) => {
  if (ttl === undefined || ttl === null || ttl === "") {
    return null;
  }
  const value = Number(ttl);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("TTL must be a positive number of minutes.");
  }
  return value;
};

const setNestedValue = (obj, keyPath, value) => {
  const keys = keyPath.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
};

const getNestedValue = (obj, keyPath) => {
  const keys = keyPath.split(".");
  let current = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
};

const padNumber = (value) => String(value).padStart(2, "0");

const formatLocalDateTime = (date) => {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());
  const hours = padNumber(date.getHours());
  const minutes = padNumber(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseTimeInput = (input, fallbackDate) => {
  if (!input || input === "now") {
    return null;
  }

  if (/^\d{1,2}:\d{2}$/.test(input)) {
    if (!fallbackDate) {
      throw new Error("Time requires a date context for HH:MM format.");
    }
    const [hours, minutes] = input.split(":");
    return `${fallbackDate}T${padNumber(hours)}:${minutes}`;
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    throw new Error("Time must be 'now', 'HH:MM', or a valid date string.");
  }

  return formatLocalDateTime(new Date(parsed));
};

const findClosestHourIndex = (times, targetTime) => {
  if (!times.length || !targetTime) {
    return 0;
  }
  const exactIndex = times.indexOf(targetTime);
  if (exactIndex !== -1) {
    return exactIndex;
  }

  const targetMs = Date.parse(targetTime);
  let closestIndex = 0;
  let closestDiff = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const diff = Math.abs(Date.parse(time) - targetMs);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = index;
    }
  });

  return closestIndex;
};

const buildCurrentSnapshot = (data, units) => {
  if (!data?.current_weather) {
    throw new Error("Weather data missing from API response");
  }

  const current = data.current_weather;
  const hourly = data.hourly ?? {};
  const hourIndex = findClosestHourIndex(hourly.time ?? [], current.time);

  const apparentTemperature =
    hourly.apparent_temperature?.[hourIndex] ?? current.temperature;
  const precipitation = hourly.precipitation?.[hourIndex] ?? 0;
  const precipProbability = hourly.precipitation_probability?.[hourIndex] ?? 0;

  const direction = toCardinalDirection(current.winddirection);
  const windDirection = direction ? `(${direction})` : "";

  return {
    time: current.time,
    temperature: current.temperature,
    feelsLike: apparentTemperature,
    windSpeed: current.windspeed,
    windDirection,
    precipProbability,
    precipitation,
    summary: describeWeatherCode(current.weathercode),
    units,
    precipitationThreshold: units.precipitation === "in" ? 0.03 : 0.8,
  };
};

const buildSnapshotForTime = (data, units, targetTime) => {
  const times = data.hourly?.time ?? [];
  const hourIndex = findClosestHourIndex(times, targetTime);
  const current = data.current_weather ?? {};
  const hourly = data.hourly ?? {};

  const weatherCode = hourly.weathercode?.[hourIndex] ?? current.weathercode;

  const direction = toCardinalDirection(current.winddirection);
  const windDirection = direction ? `(${direction})` : "";

  return {
    time: times[hourIndex] ?? current.time,
    temperature: hourly.temperature_2m?.[hourIndex] ?? current.temperature,
    feelsLike:
      hourly.apparent_temperature?.[hourIndex] ?? current.temperature,
    windSpeed: hourly.windspeed_10m?.[hourIndex] ?? current.windspeed,
    windDirection,
    precipProbability: hourly.precipitation_probability?.[hourIndex] ?? 0,
    precipitation: hourly.precipitation?.[hourIndex] ?? 0,
    summary: describeWeatherCode(weatherCode),
    units,
    precipitationThreshold: units.precipitation === "in" ? 0.03 : 0.8,
  };
};

const getDateKey = (time) => time?.split("T")[0];

const buildRecommendation = (current) => {
  const essentials = [];
  const extras = [];
  const alerts = [];

  const temp = current.feelsLike;
  const precipProb = current.precipProbability;
  const windSpeed = current.windSpeed;
  const precipLikely = precipProb >= 40 || current.precipitation >= current.precipitationThreshold;

  if (temp <= 32) {
    alerts.push("Freezing conditions - use caution");
  }

  if (precipLikely) {
    alerts.push("Wet roads expected");
  }

  if (windSpeed >= 20) {
    alerts.push("Strong winds - reduce speed");
  }

  if (temp <= 40) {
    essentials.push("Base layer");
    essentials.push("Arm warmers");
    essentials.push("Leg warmers");
    essentials.push("Full-finger gloves");
    essentials.push("Neck gaiter");
    extras.push("Vest for warm-up");
  } else if (temp <= 50) {
    essentials.push("Arm warmers");
    essentials.push("Leg warmers or knee warmers");
    essentials.push("Long-finger gloves");
  } else if (temp <= 60) {
    essentials.push("Arm warmers");
    essentials.push("Knee warmers");
  } else if (temp >= 80) {
    essentials.push("Sunscreen");
    extras.push("Extra water");
    extras.push("Electrolytes");
  }

  if (precipLikely) {
    essentials.push("Waterproof jacket");
    extras.push("Overshoes");
  } else if (precipProb >= 20) {
    essentials.push("Packable jacket");
    extras.push("Rain cape");
  }

  if (windSpeed >= 15) {
    essentials.push("Windbreaker");
  }

  extras.push("Spare tube");
  extras.push("Mini pump/CO2");
  extras.push("Multi-tool");

  if (precipLikely) {
    extras.push("Fenders");
  }

  if (temp >= 75) {
    extras.push("Extra water bottle");
  }

  return { essentials, extras, alerts };
};

const buildConfidence = (data) => {
  const probabilities = data.hourly?.precipitation_probability ?? [];
  if (!probabilities.length) {
    return "medium";
  }
  const max = Math.max(...probabilities.filter((value) => Number.isFinite(value)));
  if (!Number.isFinite(max)) {
    return "medium";
  }
  if (max >= 70) {
    return "low";
  }
  if (max >= 40) {
    return "medium";
  }
  return "high";
};

const buildRoadStatus = (data, units) => {
  const precipitation = data.daily?.precipitation_sum?.[0];
  if (!Number.isFinite(precipitation)) {
    return "unknown";
  }
  const wetThreshold = units.precipitation === "in" ? 0.05 : 1.5;
  if (precipitation >= wetThreshold) {
    return "wet";
  }
  if (precipitation > 0) {
    return "damp";
  }
  return "dry";
};

const promptField = async (rl, label, value) => {
  const suffix = value ? ` (${value})` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed || value;
};

const promptForConfig = async (config) => {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive prompts require a TTY.");
  }
  const rl = createInterface({ input, output });
  try {
    const location = await promptField(rl, "Default location", config.location);
    const units = await promptField(rl, "Units (us/metric)", config.units);
    const profile = await promptField(rl, "Profile", config.profile);
    return { location, units, profile };
  } finally {
    rl.close();
  }
};

const promptForLocation = async (current) => {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive prompts require a TTY.");
  }
  const rl = createInterface({ input, output });
  try {
    return await promptField(rl, "Location", current ?? "");
  } finally {
    rl.close();
  }
};

const buildHourlyBreakdown = (data, nowTime) => {
  const times = data.hourly?.time ?? [];
  const dateKey = getDateKey(nowTime ?? data.current_weather?.time ?? times[0]);

  if (!dateKey) {
    return [];
  }

  const nowMs = Date.parse(nowTime ?? data.current_weather?.time ?? "");

  return times.reduce((entries, time, index) => {
    if (getDateKey(time) !== dateKey) {
      return entries;
    }

    const timeMs = Date.parse(time);
    if (Number.isFinite(nowMs) && Number.isFinite(timeMs) && timeMs < nowMs) {
      return entries;
    }

    if (entries.length > 0) {
      const lastTime = entries[entries.length - 1]?.time;
      const lastMs = Date.parse(lastTime);
      if (Number.isFinite(lastMs) && Number.isFinite(timeMs)) {
        const hoursDiff = Math.abs(timeMs - lastMs) / (1000 * 60 * 60);
        if (hoursDiff < 3) {
          return entries;
        }
      }
    }

    entries.push({
      time,
      temperature: data.hourly?.temperature_2m?.[index],
      feelsLike: data.hourly?.apparent_temperature?.[index],
      windSpeed: data.hourly?.windspeed_10m?.[index],
      precipitation: data.hourly?.precipitation?.[index],
      precipProbability: data.hourly?.precipitation_probability?.[index],
    });

    return entries;
  }, []);
};

const buildDaylight = (data) => {
  const sunrise = data.daily?.sunrise?.[0];
  const sunset = data.daily?.sunset?.[0];

  if (!sunrise || !sunset) {
    return null;
  }

  const now = Date.parse(data.current_weather?.time ?? "");
  const sunsetMs = Date.parse(sunset);
  const msUntilSunset = sunsetMs - now;
  const warning =
    Number.isFinite(msUntilSunset) && msUntilSunset >= 0 && msUntilSunset <= 60 * 60 * 1000
      ? "Sunset within the hour — bring lights"
      : null;

  return { sunrise, sunset, warning };
};

const buildPayload = ({
  mode,
  location,
  current,
  recommendation,
  tips,
  daylight,
  hourly,
  confidence,
  roadStatus,
}) => ({
  mode,
  location: location.displayName,
  time: current.time,
  summary: current.summary,
  temperature: current.temperature,
  feelsLike: current.feelsLike,
  windSpeed: current.windSpeed,
  windDirection: current.windDirection,
  precipProbability: current.precipProbability,
  precipitation: current.precipitation,
  units: current.units,
  wear: recommendation?.essentials ?? [],
  bring: recommendation?.extras ?? [],
  alerts: recommendation?.alerts ?? [],
  tips: tips ?? [],
  daylight,
  hourly,
  confidence,
  roadStatus,
});

const buildListPayload = ({ mode, recommendation }) => {
  if (mode === "wear") {
    return { mode, wear: recommendation?.essentials ?? [] };
  }
  if (mode === "gear") {
    return { mode, bring: recommendation?.extras ?? [] };
  }
  return { mode };
};

const resolveLocation = async ({ locationInput, spinner, theme }) => {
  const cached = await loadLocationCache({ query: locationInput });
  if (cached.hit) {
    return { location: cached.data, cacheHit: true };
  }

  try {
    const location = await geocodeLocation(locationInput);
    try {
      await saveLocationCache({ query: locationInput, data: location });
    } catch (cacheError) {
    }
    return { location, cacheHit: false };
  } catch (error) {
    if (spinner) {
      spinner.fail(theme.bad(error.message));
    }
    throw error;
  }
};

const resolveWeather = async ({ location, units, spinner, theme, ttlMs }) => {
  try {
    const cached = await loadCache({
      latitude: location.latitude,
      longitude: location.longitude,
      units,
      ttlMs,
    });

    if (cached.hit) {
      if (spinner) {
        spinner.succeed("Using cached weather");
      }
      return cached.data;
    }

    if (spinner) {
      spinner.start("Fetching weather...");
    }
    const weather = await fetchWeather(location.latitude, location.longitude, units);
    if (spinner) {
      spinner.succeed("Weather synced");
    }

    try {
      await saveCache({
        latitude: location.latitude,
        longitude: location.longitude,
        units,
        data: weather,
      });
    } catch (cacheError) {
    }

    return weather;
  } catch (error) {
    if (spinner) {
      spinner.fail(theme.bad(error.message));
    }
    throw error;
  }
};

const runConditions = async ({
  mode,
  options,
  title,
  includeHourly,
  renderMode,
  onlyLists = false,
}) => {
  const config = await loadConfig();
  const units = normalizeUnits(options.units ?? config.units);
  const format = normalizeFormat(options.format);
  const colorEnabled = options.color && format === "text";
  const emojiEnabled = options.emoji;
  const theme = createTheme({ colorEnabled });
  const spinner = options.quiet || format !== "text" || !process.stdout.isTTY
    ? null
    : ora({ text: "Finding location...", color: "cyan" });

  let locationInput = options.location ?? config.location;
  if (!locationInput && options.interactive) {
    locationInput = await promptForLocation(config.location);
    if (locationInput) {
      await updateConfig({ location: locationInput });
    }
  }
  if (!locationInput) {
    throw new Error("Location is required. Use --location or bike config set location.");
  }

  if (spinner) {
    spinner.start("Finding location...");
  }
  const { location, cacheHit } = await resolveLocation({ locationInput, spinner, theme });
  if (spinner) {
    spinner.succeed(cacheHit ? `Using cached location (${location.displayName})` : `Found ${location.displayName}`);
    spinner.start("Checking cache...");
  }

  const ttlOverride = normalizeTtl(options.ttl);
  const ttlMs = ttlOverride ? ttlOverride * 60 * 1000 : undefined;
  const weather = await resolveWeather({ location, units, spinner, theme, ttlMs });

  const timeInput = parseTimeInput(options.time, getDateKey(weather.data.current_weather?.time));
  const current = timeInput
    ? buildSnapshotForTime(weather.data, weather.units, timeInput)
    : buildCurrentSnapshot(weather.data, weather.units);

  const recommendation = buildRecommendation(current);
  const tips = buildBikeTips(current);
  const hourly = includeHourly ? buildHourlyBreakdown(weather.data, current.time) : [];
  const daylight = buildDaylight(weather.data);
  const confidence = buildConfidence(weather.data);
  const roadStatus = buildRoadStatus(weather.data, weather.units);

  const payload = buildPayload({
    mode,
    location,
    current,
    recommendation,
    tips,
    daylight,
    hourly: includeHourly ? hourly : [],
    confidence,
    roadStatus,
  });

  if (format === "json") {
    if (onlyLists) {
      return renderJson(buildListPayload({ mode, recommendation }));
    }
    return renderJson(payload);
  }

  if (format === "csv") {
    return renderCsv(payload);
  }

  if (onlyLists) {
    return renderMode({ recommendation, theme, emojiEnabled });
  }

  return renderMode({
    location,
    current,
    recommendation,
    tips,
    daylight,
    hourly: includeHourly ? hourly : [],
    confidence,
    roadStatus,
    emojiEnabled,
    theme,
    quiet: options.quiet,
    title,
  });
};

const addSharedOptions = (command) =>
  command
    .option("-l, --location <location>", "Location to check")
    .option("--time <time>", "Time to plan for", "now")
    .option("--duration <minutes>", "Duration in minutes")
    .option("--units <units>", "Units: us or metric")
    .option("--profile <profile>", "Rider profile")
    .option("--format <format>", "Output: text, json, or csv", "text")
    .option("--ttl <minutes>", "Cache TTL in minutes")
    .option("--no-color", "Disable colored output")
    .option("--quiet", "Minimal output")
    .option("--interactive", "Prompt for missing info")
    .option("--no-emoji", "Disable emoji in output");

export const run = async () => {
  const program = new Command();
  program
    .name("bike")
    .description("Cycling weather and gear guidance for riders.")
    .addHelpText(
      "after",
      `\nExamples:\n  $ bike now\n  $ bike plan --time 07:30\n  $ bike gear --location \"Seattle, WA\"\n`
    );

  const nowCommand = program
    .command("now", { isDefault: true })
    .description("Current conditions with wear + gear guidance");

  addSharedOptions(nowCommand).action(async () => {
    try {
      const output = await runConditions({
        mode: "now",
        options: nowCommand.opts(),
        title: "Bike conditions",
        includeHourly: true,
        renderMode: renderReport,
      });
      process.stdout.write(`${output}\n`);
    } catch (error) {
      program.error(error.message);
    }
  });

  const planCommand = program
    .command("plan")
    .description("Plan for a future time");

  addSharedOptions(planCommand).action(async () => {
    try {
      const output = await runConditions({
        mode: "plan",
        options: planCommand.opts(),
        title: "Route plan",
        includeHourly: true,
        renderMode: renderReport,
      });
      process.stdout.write(`${output}\n`);
    } catch (error) {
      program.error(error.message);
    }
  });

  const planRouteCommand = planCommand
    .command("route <start> <end>")
    .description("Plan a specific route (coming soon)");

  addSharedOptions(planRouteCommand).action(async (start, end) => {
    const options = planRouteCommand.opts();
    const theme = createTheme({ colorEnabled: options.color });
    const emojiEnabled = options.emoji;
    const bikeIcon = emojiEnabled ? "🚴" : "Bike";
    const lines = [
      `${theme.title(bikeIcon)} ${theme.title("Route planning")}`,
      theme.muted(`Start: ${start}`),
      theme.muted(`End: ${end}`),
      "",
      theme.warn("Route-aware forecasts are coming soon."),
      theme.muted("Use `bike plan --time` for now."),
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  });

  const wearCommand = program
    .command("wear")
    .description("Outfit guidance only");

  addSharedOptions(wearCommand).action(async () => {
    try {
      const output = await runConditions({
        mode: "wear",
        options: wearCommand.opts(),
        title: "Wear",
        includeHourly: false,
        onlyLists: true,
        renderMode: ({ recommendation, theme, emojiEnabled }) =>
          renderChecklist({
            title: "Wear",
            items: recommendation.essentials,
            icon: emojiEnabled ? theme.good("✓") : theme.good("*"),
            emptyLabel: "standard kit",
            theme,
          }),
      });
      process.stdout.write(`${output}\n`);
    } catch (error) {
      program.error(error.message);
    }
  });

  const gearCommand = program
    .command("gear")
    .description("Packing checklist only");

  addSharedOptions(gearCommand).action(async () => {
    try {
      const output = await runConditions({
        mode: "gear",
        options: gearCommand.opts(),
        title: "Bring",
        includeHourly: false,
        onlyLists: true,
        renderMode: ({ recommendation, theme, emojiEnabled }) =>
          renderChecklist({
            title: "Bring",
            items: recommendation.extras,
            icon: emojiEnabled ? theme.muted("-") : theme.muted("-"),
            emptyLabel: "no extras",
            theme,
          }),
      });
      process.stdout.write(`${output}\n`);
    } catch (error) {
      program.error(error.message);
    }
  });

  const routeCommand = program
    .command("route")
    .description("Route conditions summary");

  addSharedOptions(routeCommand).action(async () => {
    try {
      const output = await runConditions({
        mode: "route",
        options: routeCommand.opts(),
        title: "Route summary",
        includeHourly: false,
        renderMode: renderRouteSummary,
      });
      process.stdout.write(`${output}\n`);
    } catch (error) {
      program.error(error.message);
    }
  });

  const config = program.command("config").description("Manage defaults");

  config
    .command("init")
    .description("Interactively set defaults")
    .action(async () => {
      try {
        const current = await loadConfig();
        const next = await promptForConfig(current);
        normalizeUnits(next.units);
        const updated = await updateConfig(next);
        const output = renderConfigSummary({
          title: "Config Updated",
          entries: [
            { label: "location:", value: updated.location },
            { label: "units:", value: updated.units },
            { label: "profile:", value: updated.profile },
          ],
          theme: createTheme({ colorEnabled: process.stdout.isTTY }),
        });
        process.stdout.write(`${output}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  config
    .command("get <key>")
    .description("Read a single config value")
    .action(async (key) => {
      const current = await loadConfig();
      const value = getNestedValue(current, key);

      if (value === undefined) {
        program.error(`Unknown key: ${key}`);
        return;
      }
      const output = renderConfigValue({
        key,
        value,
        theme: createTheme({ colorEnabled: process.stdout.isTTY }),
      });
      process.stdout.write(`${output}\n`);
    });

  config
    .command("set <key> <value>")
    .description("Set a config value")
    .action(async (key, value) => {
      const defaults = getConfigDefaults();
      const existingValue = getNestedValue(defaults, key);

      if (existingValue === undefined) {
        program.error(`Unknown key: ${key}`);
        return;
      }
      if (key === "units") {
        normalizeUnits(value);
      }

      const current = await loadConfig();
      const next = { ...current };

      if (key.includes(".")) {
        setNestedValue(next, key, value);
      } else {
        next[key] = value;
      }

      await saveConfig(next);

      const newValue = getNestedValue(next, key);
      const output = renderConfigValue({
        key,
        value: newValue,
        theme: createTheme({ colorEnabled: process.stdout.isTTY }),
      });
      process.stdout.write(`${output}\n`);
    });

  config
    .command("list")
    .description("List config values")
    .action(async () => {
      const current = await loadConfig();
      const output = renderConfigSummary({
        title: "Config Values",
        entries: Object.entries(current).map(([entryKey, value]) => ({
          label: `${entryKey}:`,
          value,
        })),
        theme: createTheme({ colorEnabled: process.stdout.isTTY }),
      });
      process.stdout.write(`${output}\n`);
    });

  config
    .command("migrate")
    .description("Migrate config to latest schema")
    .action(async () => {
      try {
        const current = await loadConfig();
        const defaults = getConfigDefaults();
        let updated = false;
        const changes = [];

        if (!current.dbPath) {
          current.dbPath = getEffectiveDbPath(defaults);
          changes.push(`dbPath set to ${current.dbPath}`);
          updated = true;
        }

        if (typeof current.strava !== "object" || current.strava === null) {
          current.strava = defaults.strava;
          changes.push("strava config initialized");
          updated = true;
        }

        if (!current.strava?.clientId && process.env.BIKE_STRAVA_CLIENT_ID) {
          current.strava.clientId = process.env.BIKE_STRAVA_CLIENT_ID;
          changes.push("strava.clientId from env");
          updated = true;
        }

        if (!current.strava?.clientSecret && process.env.BIKE_STRAVA_CLIENT_SECRET) {
          current.strava.clientSecret = process.env.BIKE_STRAVA_CLIENT_SECRET;
          changes.push("strava.clientSecret from env");
          updated = true;
        }

        if (!current.defaultBikeId) {
          current.defaultBikeId = defaults.defaultBikeId;
          changes.push("defaultBikeId initialized");
          updated = true;
        }

        const theme = createTheme({ colorEnabled: process.stdout.isTTY });
        if (updated) {
          await updateConfig(current);
          const output = renderConfigChanges({
            title: "Config Updated",
            changes,
            theme,
          });
          process.stdout.write(`${output}\n`);

          await initializeData();
          const hint = renderHint({
            message: `Data initialized at: ${path.join(os.homedir(), ".config", "bike-cli", "data.json")}`,
            theme,
          });
          process.stdout.write(`${hint}\n`);
        } else {
          const output = renderConfigSummary({
            title: "Config",
            entries: [{ label: "Status:", value: "Already up to date" }],
            theme,
          });
          process.stdout.write(`${output}\n`);
        }
      } catch (error) {
        program.error(error.message);
      }
    });

  const auth = program.command("auth").description("Manage Strava authentication");
  auth.option("--no-color", "Disable colored output");

  auth
    .command("login")
    .description("Authenticate with Strava")
    .action(async () => {
      try {
        await initializeData();

        const stravaClient = await createStravaClient();
        const result = await stravaClient.authorize();

        const theme = createTheme({ colorEnabled: process.stdout.isTTY });
        process.stdout.write(`\n${renderSectionHeader({ title: "Authentication", theme })}\n`);
        process.stdout.write(
          `${theme.muted("Name:")} ${result.name} (${result.city}, ${result.state}, ${result.country})\n`
        );
        process.stdout.write(`${theme.muted("Athlete ID:")} ${result.athleteId}\n`);
        process.stdout.write(`${theme.muted("Scopes:")} ${result.scopes}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  auth
    .command("status")
    .description("Check Strava authentication status")
    .action(async () => {
      try {
        const config = await loadConfig();
        await initializeData();

        const stravaClient = await createStravaClient();
        const data = await loadData();
        const token = getStravaToken(data, stravaClient.athleteId);

        const theme = createTheme({ colorEnabled: auth.opts().color && process.stdout.isTTY });
        if (!token) {
          const output = renderConfigSummary({
            title: "Authentication",
            entries: [{ label: "Status:", value: "Not authenticated" }],
            theme,
          });
          process.stdout.write(`${output}\n`);
          process.stdout.write(`${renderHint({ message: "Run 'bike auth login' to connect your account.", theme })}\n`);
          return;
        }

        const output = renderAuthStatus(
          {
            athlete_id: token.athleteId,
            expires_at: token.expiresAt,
            scopes: token.scopes,
          },
          theme
        );

        process.stdout.write(`${output}\n`);
      } catch (error) {
        if (error.message.includes("credentials")) {
          program.error(error.message);
        } else {
          program.error(error.message);
        }
      }
    });

  auth
    .command("logout")
    .description("Log out from Strava")
    .action(async () => {
      try {
        await modifyData((data) => {
          const token = getStravaToken(data, 0);

          if (!token) {
            process.stdout.write("Not authenticated with Strava.\n");
            return;
          }

          deleteStravaToken(data, token.athleteId);
          const theme = createTheme({ colorEnabled: process.stdout.isTTY });
          process.stdout.write(`${theme.good("Logged out from Strava.")}\n`);
        });
      } catch (error) {
        program.error(error.message);
      }
    });

  program
    .command("sync")
    .description("Sync activities and bikes from Strava")
    .option("--since <date>", "Sync activities since date (YYYY-MM-DD)")
    .option("--full", "Full sync (last 365 days)")
    .action(async (options) => {
      try {
        const spinner = ora("Syncing from Strava...").start();

        const result = await sync({
          since: options.since,
          full: options.full,
        });

        spinner.succeed("Sync complete");

        const output = renderSyncResult(
          result,
          { format: "text" },
          createTheme({ colorEnabled: process.stdout.isTTY })
        );
        process.stdout.write(`\n${output}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  const bikes = program.command("bikes").description("Manage bikes");

  bikes
    .command("add <name>")
    .description("Add a new bike")
    .option("--type <type>", "Bike type (road/gravel/commuter/touring)")
    .option("--strava-gear-id <id>", "Strava gear ID for syncing")
    .option("--notes <notes>", "Additional notes")
    .action(async (name, options) => {
      try {
        const bikeId = crypto.randomUUID();

        await modifyData((data) => {
          upsertBike(data, {
            id: bikeId,
            name,
            type: options.type || null,
            stravaGearId: options.stravaGearId || null,
            isDefault: false,
            notes: options.notes || null,
          });
        });

        const theme = createTheme({ colorEnabled: process.stdout.isTTY });
        process.stdout.write(`${theme.good(`Bike added: ${name}`)}\n`);
        process.stdout.write(`${theme.muted(`ID: ${bikeId}`)}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  bikes
    .command("list")
    .description("List all bikes")
    .action(async () => {
      try {
        await initializeData();

        const data = await loadData();
        const bikesList = getBikes(data);
        const config = await loadConfig();
        const defaultBikeId = config.defaultBikeId;

        const theme = createTheme({ colorEnabled: process.stdout.isTTY });
        if (bikesList.length === 0) {
          const output = renderConfigSummary({
            title: "Bikes",
            entries: [{ label: "Status:", value: "No bikes found" }],
            theme,
          });
          process.stdout.write(`${output}\n`);
          process.stdout.write(`${renderHint({ message: "Run 'bike bikes add <name>' to add one.", theme })}\n`);
          return;
        }

        process.stdout.write(`${renderSectionHeader({ title: "Bikes", theme })}\n`);
        const output = renderBikesList(bikesList, defaultBikeId, theme);
        process.stdout.write(`${output}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  bikes
    .command("remove <id>")
    .description("Remove a bike")
    .action(async (id) => {
      try {
        await modifyData((data) => {
          const bike = getBike(data, id);
          if (!bike) {
            program.error(`Bike not found: ${id}`);
            throw new Error(`Bike not found: ${id}`);
          }

          deleteBike(data, id);
          const theme = createTheme({ colorEnabled: process.stdout.isTTY });
          process.stdout.write(`${theme.good(`Bike removed: ${bike.name}`)}\n`);
        });
      } catch (error) {
        program.error(error.message);
      }
    });

  bikes
    .command("set-default <id>")
    .description("Set default bike")
    .action(async (id) => {
      try {
        await modifyData((data) => {
          const bike = getBike(data, id);
          if (!bike) {
            program.error(`Bike not found: ${id}`);
            throw new Error(`Bike not found: ${id}`);
          }

          setDefaultBike(data, id);
          const theme = createTheme({ colorEnabled: process.stdout.isTTY });
          process.stdout.write(`${theme.good(`Default bike set to: ${bike.name}`)}\n`);
        });

        await updateConfig({ defaultBikeId: id });
      } catch (error) {
        program.error(error.message);
      }
    });

  bikes
    .command("rename <id> <name>")
    .description("Rename a bike")
    .action(async (id, name) => {
      try {
        await modifyData((data) => {
          const bike = getBike(data, id);
          if (!bike) {
            program.error(`Bike not found: ${id}`);
            throw new Error(`Bike not found: ${id}`);
          }

          upsertBike(data, {
            ...bike,
            name,
          });
          const theme = createTheme({ colorEnabled: process.stdout.isTTY });
          process.stdout.write(`${theme.good(`Bike renamed: ${bike.name} → ${name}`)}\n`);
        });
      } catch (error) {
        program.error(error.message);
      }
    });

  const stats = program.command("stats").description("View riding statistics");

  stats
    .command("week")
    .description("Statistics for this week")
    .option("--bike <id>", "Filter by bike")
    .option("--format <format>", "Output: text, json, or csv", "text")
    .action(async (options) => {
      try {
        const { format = "text" } = options;
        const config = await loadConfig();
        await initializeData();

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const since = startOfWeek.toISOString().split("T")[0];

        const data = await loadData();
        const bikeId = options.bike || config.defaultBikeId;
        const statsData = getActivityStats(data, bikeId, since);

        if (format === "json") {
          process.stdout.write(JSON.stringify(statsData, null, 2));
        } else if (format === "csv") {
          const headers = ["count", "totalDistanceM", "totalTimeS", "totalElevGainM"];
          process.stdout.write(`${headers.join(",")}\n`);
          process.stdout.write(`${statsData.count},${statsData.totalDistanceM},${statsData.totalTimeS},${statsData.totalElevGainM}\n`);
        } else {
          const km = (statsData.totalDistanceM / 1000).toFixed(1);
          const hours = (statsData.totalTimeS / 3600).toFixed(1);
          const elev = statsData.totalElevGainM.toFixed(0);

          const output = renderStats({
            periodLabel: "Weekly",
            since,
            stats: {
              count: statsData.count,
              distance: km,
              time: hours,
              elevation: elev,
            },
            units: { distance: "km", time: "hours", elevation: "m" },
            theme: createTheme({ colorEnabled: process.stdout.isTTY }),
          });
          process.stdout.write(`${output}\n`);
        }
      } catch (error) {
        program.error(error.message);
      }
    });

  stats
    .command("month")
    .description("Statistics for this month")
    .option("--bike <id>", "Filter by bike")
    .option("--format <format>", "Output: text, json, or csv", "text")
    .action(async (options) => {
      try {
        const { format = "text" } = options;
        const config = await loadConfig();
        await initializeData();

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const since = startOfMonth.toISOString().split("T")[0];

        const data = await loadData();
        const bikeId = options.bike || config.defaultBikeId;
        const statsData = getActivityStats(data, bikeId, since);

        if (format === "json") {
          process.stdout.write(JSON.stringify(statsData, null, 2));
        } else if (format === "csv") {
          const headers = ["count", "totalDistanceM", "totalTimeS", "totalElevGainM"];
          process.stdout.write(`${headers.join(",")}\n`);
          process.stdout.write(`${statsData.count},${statsData.totalDistanceM},${statsData.totalTimeS},${statsData.totalElevGainM}\n`);
        } else {
          const km = (statsData.totalDistanceM / 1000).toFixed(1);
          const hours = (statsData.totalTimeS / 3600).toFixed(1);
          const elev = statsData.totalElevGainM.toFixed(0);

          const output = renderStats({
            periodLabel: "Monthly",
            since,
            stats: {
              count: statsData.count,
              distance: km,
              time: hours,
              elevation: elev,
            },
            units: { distance: "km", time: "hours", elevation: "m" },
            theme: createTheme({ colorEnabled: process.stdout.isTTY }),
          });
          process.stdout.write(`${output}\n`);
        }
      } catch (error) {
        program.error(error.message);
      }
    });

  stats
    .command("year")
    .description("Statistics for this year")
    .option("--bike <id>", "Filter by bike")
    .option("--format <format>", "Output: text, json, or csv", "text")
    .action(async (options) => {
      try {
        const { format = "text" } = options;
        const config = await loadConfig();
        await initializeData();

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const since = startOfYear.toISOString().split("T")[0];

        const data = await loadData();
        const bikeId = options.bike || config.defaultBikeId;
        const statsData = getActivityStats(data, bikeId, since);

        if (format === "json") {
          process.stdout.write(JSON.stringify(statsData, null, 2));
        } else if (format === "csv") {
          const headers = ["count", "totalDistanceM", "totalTimeS", "totalElevGainM"];
          process.stdout.write(`${headers.join(",")}\n`);
          process.stdout.write(`${statsData.count},${statsData.totalDistanceM},${statsData.totalTimeS},${statsData.totalElevGainM}\n`);
        } else {
          const km = (statsData.totalDistanceM / 1000).toFixed(1);
          const hours = (statsData.totalTimeS / 3600).toFixed(1);
          const elev = statsData.totalElevGainM.toFixed(0);

          const output = renderStats({
            periodLabel: "Yearly",
            since,
            stats: {
              count: statsData.count,
              distance: km,
              time: hours,
              elevation: elev,
            },
            units: { distance: "km", time: "hours", elevation: "m" },
            theme: createTheme({ colorEnabled: process.stdout.isTTY }),
          });
          process.stdout.write(`${output}\n`);
        }
      } catch (error) {
        program.error(error.message);
      }
    });

  const maintenance = program.command("maintenance").description("Bike maintenance tracking");

  maintenance
    .command("status")
    .description("Check maintenance status")
    .option("--bike <id>", "Filter by bike")
    .action(async (options) => {
      try {
        const config = await loadConfig();
        await initializeData();

        const bikeId = options.bike || config.defaultBikeId;
        const { getMaintenanceStatus } = await import("./utils/maintenance.js");
        const status = await getMaintenanceStatus(bikeId);

        const theme = createTheme({ colorEnabled: process.stdout.isTTY });
        if (status.components.length === 0) {
          const output = renderConfigSummary({
            title: "Maintenance",
            entries: [{ label: "Status:", value: "No components tracked" }],
            theme,
          });
          process.stdout.write(`${output}\n`);
          process.stdout.write(
            `${renderHint({ message: "Run 'bike maintenance log <kind> --component <name>' to add components.", theme })}\n`
          );
          return;
        }

        const output = renderMaintenanceStatus({
          status,
          theme,
        });
        process.stdout.write(`${output}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  maintenance
    .command("log")
    .description("Log a maintenance event")
    .option("--bike <id>", "Bike ID")
    .option("--kind <kind>", "Maintenance kind (chain/tires/brake_pads/etc)")
    .option("--component <id>", "Component ID")
    .option("--meters-at <meters>", "Odometer reading")
    .option("--notes <notes>", "Additional notes")
    .action(async (options) => {
      try {
        const { logMaintenance } = await import("./utils/maintenance.js");
        await logMaintenance(options.bike, options.kind, options.component, options.metersAt, options.notes);
        const theme = createTheme({ colorEnabled: process.stdout.isTTY });
        process.stdout.write(`${theme.good("Maintenance event logged.")}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  const training = program.command("training").description("Training guidance");

  training
    .command("summary")
    .description("Weekly training summary")
    .option("--bike <id>", "Filter by bike")
    .option("--since <date>", "Summary since (YYYY-MM-DD)")
    .option("--format <format>", "Output: text or json", "text")
    .action(async (options) => {
      try {
        const { format = "text" } = options;
        const config = await loadConfig();
        await initializeData();

        const bikeId = options.bike || config.defaultBikeId;
        const since = options.since || null;

        const summary = await buildRecommendationSummary(since, bikeId);

        if (format === "json") {
          process.stdout.write(JSON.stringify(summary, null, 2));
        } else {
          const output = renderTrainingSummary({
            summary,
            theme: createTheme({ colorEnabled: process.stdout.isTTY }),
          });
          process.stdout.write(`${output}\n`);
        }
      } catch (error) {
        program.error(error.message);
      }
    });

  training
    .command("recommend")
    .description("Get training recommendation")
    .option("--bike <id>", "Filter by bike")
    .option("--no-weather", "Skip weather check")
    .action(async (options) => {
      try {
        const config = await loadConfig();
        await initializeData();

        const bikeId = options.bike || config.defaultBikeId;

        const recommendation = await getTrainingRecommendation(bikeId);

        const output = renderTrainingRecommendation({
          recommendation,
          theme: createTheme({ colorEnabled: process.stdout.isTTY }),
        });
        process.stdout.write(`${output}\n`);
      } catch (error) {
        program.error(error.message);
      }
    });

  program.parse(process.argv);
};
