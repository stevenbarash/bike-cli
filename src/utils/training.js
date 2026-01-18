import { loadData, getActivityStats, getBikes } from "../services/db.js";
import { loadConfig } from "../services/config.js";
import { fetchWeather } from "../services/openMeteo.js";
import { describeWeatherCode } from "../services/openMeteo.js";

const assessWeatherForTraining = async (location) => {
  try {
    const result = await fetchWeather(location.latitude, location.longitude, "us");
    const current = result.data.current_weather;
    const hourly = result.data.hourly;

    const temp = current.temperature;
    const precipProb = hourly.precipitation_probability?.[0] || 0;
    const windSpeed = current.windspeed_10m;

    const concerns = [];

    if (temp < 32) {
      concerns.push("freezing - add warm-up");
    } else if (temp < 45) {
      concerns.push("cold - bring layers");
    } else if (temp > 85) {
      concerns.push("very hot - extra water");
    }

    if (precipProb >= 50) {
      concerns.push("high precip chance");
    }

    if (windSpeed >= 15) {
      concerns.push("strong winds");
    }

    return {
      temp,
      precipProb,
      windSpeed,
      concerns,
    };
  } catch (error) {
    return null;
  }
};

export const buildRecommendationSummary = async (since, bikeId) => {
  const data = await loadData();

  const stats = getActivityStats(data, bikeId, since);

  if (stats.count === 0) {
    return {
      count: 0,
      totalDistanceKm: 0,
      totalHours: 0,
      avgSpeedKph: 0,
      intensity: "none",
      weeklyRides: 0,
      recommendation: "No rides found in this period.",
    };
  }

  const totalDistanceKm = stats.totalDistanceM / 1000;
  const totalHours = stats.totalTimeS / 3600;
  const avgSpeedKph = totalHours > 0 ? totalDistanceKm / totalHours : 0;
  const elevGainKm = stats.totalElevGainM / 1000;

  let intensity = "easy";
  if (avgSpeedKph > 25 || stats.count >= 4) {
    intensity = "hard";
  } else if (avgSpeedKph > 20 || stats.count >= 3) {
    intensity = "moderate";
  }

  const weeksCovered = (Date.now() - new Date(since).getTime()) / (7 * 24 * 60 * 60 * 1000);
  const weeklyRides = stats.count / (weeksCovered || 1);

  return {
    count: stats.count,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    totalHours: Number(totalHours.toFixed(1)),
    avgSpeedKph: Number(avgSpeedKph.toFixed(1)),
    elevGainKm: Number(elevGainKm.toFixed(2)),
    intensity,
    weeklyRides: Number(weeklyRides.toFixed(1)),
    recommendation: `${stats.count} rides, ${totalDistanceKm.toFixed(0)} km`,
  };
};

export const getTrainingRecommendation = async (bikeId) => {
  const config = await loadConfig();
  const data = await loadData();

  const bikes = getBikes(data);
  const bike = bikes.find((b) => b.id === bikeId) || bikes.find((b) => b.isDefault);

  if (!bike) {
    return {
      suggestion: "No bike selected.",
      weather: null,
      tip: "Run 'bike bikes add <name>' or 'bike bikes set-default <id>' first.",
    };
  }

  const weather = await assessWeatherForTraining({ latitude: 40.7128, longitude: -74.006 });

  const recommendation = {
    suggestion: "easy ride",
    duration: "60-90 min",
    weather,
    tip: "Always listen to your body.",
  };

  if (weather?.concerns?.length > 0) {
    recommendation.tip = `Weather conditions: ${weather.concerns.join(", ")}`;
  }

  if (weather?.temp < 45) {
    recommendation.suggestion = "tempo intervals (warm up indoors first)";
    recommendation.duration = "45-60 min";
  } else if (weather?.temp > 75 || weather?.precipProb >= 40) {
    recommendation.suggestion = "easy recovery ride";
    recommendation.duration = "60-90 min";
  } else if (weather?.windSpeed >= 12) {
    recommendation.suggestion = "out-and-back (avoid headwind)";
    recommendation.duration = "60-90 min";
  }

  return recommendation;
};
