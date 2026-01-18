const GEO_BASE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE_URL = "https://api.open-meteo.com/v1/forecast";

const unitPresets = {
  us: {
    temperatureUnit: "fahrenheit",
    windspeedUnit: "mph",
    precipitationUnit: "inch",
    temperatureLabel: "°F",
    windspeedLabel: "mph",
    precipitationLabel: "in",
  },
  metric: {
    temperatureUnit: "celsius",
    windspeedUnit: "kmh",
    precipitationUnit: "mm",
    temperatureLabel: "°C",
    windspeedLabel: "km/h",
    precipitationLabel: "mm",
  },
};

const weatherCodeLabels = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe hailstorm",
};

const buildUrl = (base, params) => {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url;
};

const fetchJson = async (url, errorMessage) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${errorMessage} (status ${response.status})`);
  }
  return response.json();
};

const buildLocationLabel = (result) => {
  const parts = [result.name, result.admin1, result.country].filter(Boolean);
  return parts.join(", ");
};

const geocodeOnce = async (query) => {
  const url = buildUrl(GEO_BASE_URL, {
    name: query,
    count: 1,
    language: "en",
    format: "json",
  });

  const data = await fetchJson(url, "Unable to geocode location");
  return data.results?.[0] ?? null;
};

const normalizeQuery = (query) => {
  const trimmed = query.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return trimmed;
  }

  const tokens = trimmed.split(" ");
  if (tokens.length > 1) {
    const lastToken = tokens[tokens.length - 1];
    if (/^[A-Za-z]{2}$/.test(lastToken)) {
      tokens.pop();
    }
  }

  const normalized = tokens.join(" ");
  if (/\bnyc\b/i.test(normalized)) {
    return normalized.replace(/\bnyc\b/gi, "New York");
  }
  return normalized;
};

export const geocodeLocation = async (query) => {
  const normalizedQuery = normalizeQuery(query);
  let result = await geocodeOnce(normalizedQuery);

  if (!result && /\bnew york\b/i.test(normalizedQuery)) {
    result = await geocodeOnce("New York NY");
  }

  if (!result) {
    throw new Error("No matching location found");
  }

  return {
    name: result.name,
    admin1: result.admin1,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
    displayName: buildLocationLabel(result),
  };
};

export const fetchWeather = async (latitude, longitude, units) => {
  const unitPreset = unitPresets[units];
  const url = buildUrl(FORECAST_BASE_URL, {
    latitude,
    longitude,
    current_weather: true,
    hourly:
      "temperature_2m,apparent_temperature,precipitation,precipitation_probability,windspeed_10m,weathercode",
    daily: "sunrise,sunset,precipitation_sum",
    temperature_unit: unitPreset.temperatureUnit,
    windspeed_unit: unitPreset.windspeedUnit,
    precipitation_unit: unitPreset.precipitationUnit,
    timezone: "auto",
  });

  const data = await fetchJson(url, "Unable to fetch weather");

  return {
    data,
    units: {
      temperature: unitPreset.temperatureLabel,
      windSpeed: unitPreset.windspeedLabel,
      precipitation: unitPreset.precipitationLabel,
    },
  };
};

export const describeWeatherCode = (code) =>
  weatherCodeLabels[code] ?? "Unknown conditions";
