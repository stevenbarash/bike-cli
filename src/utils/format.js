import Table from "cli-table3";

const fallbackTheme = {
  title: (text) => text,
  accent: (text) => text,
  muted: (text) => text,
  good: (text) => text,
  warn: (text) => text,
  bad: (text) => text,
  section: (text) => text,
  body: (text) => text,
  dim: (text) => text,
};

const buildDivider = (label, theme) =>
  theme.muted("-".repeat(Math.max(20, label.length)));

const formatNumber = (value, digits = 0) => {
  if (!Number.isFinite(value)) {
    return "–";
  }
  return Number(value).toFixed(digits);
};

const formatHour = (time) => {
  if (!time) {
    return "–";
  }
  const [, clock = ""] = time.split("T");
  return clock.slice(0, 5);
};

const formatDisplayTime = (time) => {
  if (!time) {
    return "";
  }
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) {
    return time;
  }
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export const toCardinalDirection = (degrees) => {
  if (!Number.isFinite(degrees)) {
    return "";
  }
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
};

const renderList = (items, icon, theme, emptyLabel = "none") => {
  if (!items.length) {
    return theme.muted(`- ${emptyLabel}`);
  }
  return items.map((item) => `${icon} ${item}`).join("\n");
};

export const formatCurrentConditions = (current) => ({
  temperature: formatNumber(current.temperature, 0),
  feelsLike: formatNumber(current.feelsLike, 0),
  windSpeed: formatNumber(current.windSpeed, 0),
  precipitation: formatNumber(
    current.precipitation,
    current.units.precipitation === "in" ? 2 : 1
  ),
  precipitationProbability: formatNumber(current.precipProbability, 0),
});

const renderHourlyTable = ({ hourly, units, theme }) => {
  const table = new Table({
    head: [
      theme.dim("Time"),
      theme.dim(`Temp ${units.temperature}`),
      theme.dim(`Feels ${units.temperature}`),
      theme.dim(`Wind ${units.windSpeed}`),
      theme.dim("Precip"),
    ],
    colWidths: [8, 10, 10, 12, 20],
    wordWrap: true,
    style: { head: [], border: [] },
  });

  hourly.forEach((entry) => {
    const precipAmount = formatNumber(
      entry.precipitation,
      units.precipitation === "in" ? 2 : 1
    );
    const precipProbability = formatNumber(entry.precipProbability, 0);
    const precipText = `${precipProbability}% · ${precipAmount}${units.precipitation}`;
    const precipCell = Number(entry.precipProbability) >= 40
      ? theme.warn(precipText)
      : precipText;
    const windValue = formatNumber(entry.windSpeed, 0);
    const windCell = Number(entry.windSpeed) >= 15 ? theme.warn(windValue) : windValue;
    const tempCell = formatTemperature(entry.temperature, units.temperature, theme);
    const feelsCell = formatTemperature(entry.feelsLike, units.temperature, theme);

    table.push([
      formatHour(entry.time),
      tempCell,
      feelsCell,
      `${windCell}`,
      precipCell,
    ]);
  });

  return table.toString();
};

const renderDaylight = ({ daylight, theme }) => {
  if (!daylight) {
    return theme.muted("Daylight data unavailable");
  }

  const sunrise = formatHour(daylight.sunrise);
  const sunset = formatHour(daylight.sunset);
  const lines = [`Sunrise ${sunrise}`, `Sunset ${sunset}`];

  if (daylight.warning) {
    lines.push(theme.warn(`! ${daylight.warning}`));
  }

  return lines.join("\n");
};

const formatTemperature = (value, units, theme) => {
  if (!Number.isFinite(value)) {
    return `–${units}`;
  }
  if (value <= 40) {
    return theme.warn(`${formatNumber(value, 0)}${units}`);
  }
  if (value <= 55) {
    return theme.accent(`${formatNumber(value, 0)}${units}`);
  }
  if (value >= 80) {
    return theme.good(`${formatNumber(value, 0)}${units}`);
  }
  return `${formatNumber(value, 0)}${units}`;
};

const formatConfidence = (confidence, theme) => {
  if (!confidence) {
    return "";
  }
  if (confidence === "high") {
    return theme.good(confidence);
  }
  if (confidence === "low") {
    return theme.warn(confidence);
  }
  return theme.accent(confidence);
};

const formatRoadStatus = (status, theme) => {
  if (!status) {
    return "";
  }
  if (status === "wet") {
    return theme.warn(status);
  }
  if (status === "damp") {
    return theme.accent(status);
  }
  if (status === "dry") {
    return theme.good(status);
  }
  return theme.muted(status);
};

const renderConditions = ({ current, theme }) => {
  const formatted = formatCurrentConditions(current);
  const windValue = `${formatted.windSpeed}${current.units.windSpeed}`;
  const wind = `${windValue} ${current.windDirection}`.trim();
  const windText = Number(current.windSpeed) >= 15 ? theme.warn(wind) : theme.accent(wind);
  const precip = `${formatted.precipitationProbability}% · ${formatted.precipitation}${current.units.precipitation}`;
  const precipText = current.precipProbability >= 40 ? theme.warn(precip) : precip;
  const temperatureText = formatTemperature(current.temperature, current.units.temperature, theme);
  const feelsText = formatTemperature(current.feelsLike, current.units.temperature, theme);

  return [
    `${theme.muted("Temp:")} ${temperatureText} (feels ${feelsText})   ${theme.muted("Wind:")} ${windText}`,
    `${theme.muted("Precip:")} ${precipText}   ${current.summary}`,
  ].join("\n");
};

export const renderReport = ({
  location,
  current,
  recommendation,
  tips,
  daylight,
  hourly,
  confidence,
  roadStatus,
  emojiEnabled = true,
  theme,
  quiet = false,
  title = "Bike conditions",
}) => {
  const wearIcon = emojiEnabled ? theme.good("✓") : theme.good("*");
  const bringIcon = emojiEnabled ? theme.muted("-") : theme.muted("-");
  const bikeIcon = emojiEnabled ? "🚴" : "Bike";

  if (quiet) {
    return [
      renderList(recommendation.essentials, wearIcon, theme, "standard kit"),
      renderList(recommendation.extras, bringIcon, theme, "no extras"),
    ].join("\n");
  }

  const timestamp = formatDisplayTime(current.time);
  const headerText = `${bikeIcon} ${title} — ${timestamp}, ${location.displayName}`;
  const header = `${theme.title(bikeIcon)} ${theme.title(title)} — ${timestamp}, ${location.displayName}`;
  const divider = buildDivider(headerText, theme);

  const sections = [
    header,
    divider,
    "",
    theme.section("Conditions"),
    renderConditions({ current, theme }),
  ];

  if (roadStatus || confidence) {
    const meta = [];
    if (roadStatus) {
      meta.push(`${theme.muted("Roads:")} ${formatRoadStatus(roadStatus, theme)}`);
    }
    if (confidence) {
      meta.push(`${theme.muted("Confidence:")} ${formatConfidence(confidence, theme)}`);
    }
    sections.push(meta.join("   "));
  }

  sections.push(
    "",
    theme.section("Wear"),
    renderList(recommendation.essentials, wearIcon, theme, "standard kit"),
    "",
    theme.section("Bring"),
    renderList(recommendation.extras, bringIcon, theme, "no extras"),
  );

  if (recommendation.alerts.length) {
    sections.push(
      "",
      theme.section("Heads up"),
      recommendation.alerts.map((alert) => theme.warn(`! ${alert}`)).join("\n")
    );
  }

  if (tips?.length) {
    sections.push("", theme.section("Tips"), renderList(tips, theme.muted("-"), theme));
  }

  if (daylight) {
    sections.push("", theme.section("Daylight"), renderDaylight({ daylight, theme }));
  }

  if (hourly?.length) {
    sections.push("", theme.section("Hourly"), renderHourlyTable({ hourly, units: current.units, theme }));
  }

  return sections.join("\n");
};

export const renderChecklist = ({
  title,
  items,
  theme,
  icon = "-",
  emptyLabel = "none",
}) => {
  return [theme.section(title), renderList(items, icon, theme, emptyLabel)].join("\n");
};

export const renderRouteSummary = ({ location, current, theme, emojiEnabled = true }) => {
  const timestamp = formatDisplayTime(current.time);
  const bikeIcon = emojiEnabled ? "🚴" : "Bike";
  const headerText = `${bikeIcon} Route summary — ${timestamp}, ${location.displayName}`;
  const header = `${theme.title(bikeIcon)} ${theme.title("Route summary")} — ${timestamp}, ${location.displayName}`;
  const divider = buildDivider(headerText, theme);
  const formatted = formatCurrentConditions(current);

  const windValue = `${formatted.windSpeed}${current.units.windSpeed}`;
  const wind = `${windValue} ${current.windDirection}`.trim();
  const windText = Number(current.windSpeed) >= 15 ? theme.warn(wind) : theme.accent(wind);
  const precip = `${formatted.precipitationProbability}% · ${formatted.precipitation}${current.units.precipitation}`;
  const precipText = current.precipProbability >= 40 ? theme.warn(precip) : precip;

  const temperatureText = formatTemperature(current.temperature, current.units.temperature, theme);
  const feelsText = formatTemperature(current.feelsLike, current.units.temperature, theme);

  const lines = [
    theme.section("Conditions"),
    `${theme.muted("Wind:")} ${windText}`,
    `${theme.muted("Precip:")} ${precipText}`,
    `${theme.muted("Temp:")} ${temperatureText} (feels ${feelsText})`,
  ];

  return [header, divider, "", ...lines].join("\n");
};

export const renderJson = (payload) => JSON.stringify(payload, null, 2);

const escapeCsv = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const renderCsv = (payload) => {
  if (payload.mode === "wear") {
    return payload.wear?.map(escapeCsv).join(",") ?? "";
  }
  if (payload.mode === "gear") {
    return payload.bring?.map(escapeCsv).join(",") ?? "";
  }

  const headers = [
    "location",
    "time",
    "summary",
    "temperature",
    "feelsLike",
    "windSpeed",
    "windDirection",
    "precipProbability",
    "precipitation",
  ];
  const row = [
    payload.location,
    payload.time,
    payload.summary,
    payload.temperature,
    payload.feelsLike,
    payload.windSpeed,
    payload.windDirection,
    payload.precipProbability,
    payload.precipitation,
  ];

  return `${headers.join(",")}\n${row.map(escapeCsv).join(",")}`;
};

export const renderSyncResult = (result, options = {}, theme = fallbackTheme) => {
  if (options.format === "json") {
    return renderJson(result);
  }

  const lines = [
    theme.section("Sync Complete"),
    "",
    theme.section("Athlete"),
    `${theme.muted("Name:")} ${result.athlete.name}`,
    `  ${theme.muted("ID:")} ${result.athlete.id}`,
    `  ${theme.muted("Location:")} ${result.athlete.city}, ${result.athlete.state}, ${result.athlete.country}`,
    "",
    theme.section("Bikes"),
    `  ${theme.muted("Synced:")} ${theme.good(String(result.bikes.bikesCount))}`,
    "",
    theme.section("Activities"),
    `  ${theme.muted("Added:")} ${theme.good(String(result.activities.added))}`,
    `  ${theme.muted("Updated:")} ${theme.accent(String(result.activities.updated))}`,
  ];

  return lines.join("\n");
};

export const renderAuthStatus = (token, theme = fallbackTheme) => {
  if (!token) {
    return "Not authenticated with Strava.\nRun 'bike auth login' to connect.";
  }

  const isExpired = Math.floor(Date.now() / 1000) >= token.expires_at - 300;
  const expiresAt = new Date(token.expires_at * 1000).toLocaleString();
  const statusText = isExpired ? theme.bad("EXPIRED") : theme.good("Active");

  const lines = [
    theme.section("Authentication"),
    "",
    `${theme.muted("Athlete ID:")} ${token.athlete_id}`,
    `${theme.muted("Scopes:")} ${token.scopes}`,
    `${theme.muted("Expires:")} ${expiresAt}`,
    `${theme.muted("Status:")} ${statusText}`,
  ];

  return lines.join("\n");
};

export const renderBikesList = (bikes, defaultBikeId, theme = fallbackTheme) => {
  if (bikes.length === 0) {
    return "No bikes found.\nRun 'bike bikes add <name>' to add one.";
  }

  return bikes
    .map((bike) => {
      const isDefault = bike.id === defaultBikeId || bike.isDefault;
      const marker = isDefault ? " [DEFAULT]" : "";
      const type = bike.type ? ` (${bike.type})` : "";
      const stravaId = bike.stravaGearId ? ` [Strava: ${bike.stravaGearId}]` : "";
      const notes = bike.notes ? `\n    ${theme.dim(`Notes: ${bike.notes}`)}` : "";

      const nameText = isDefault ? theme.title(`${bike.name}${marker}`) : bike.name;
      const typeText = type ? theme.muted(type) : "";
      const stravaText = stravaId ? theme.dim(stravaId) : "";

      return `  ${nameText}${typeText}${stravaText}${notes}`;
    })
    .join("\n");
};

export const renderStats = ({ periodLabel, since, stats, units = {}, theme = fallbackTheme }) => {
  const title = `${periodLabel} Stats`;
  const headerText = since ? `${title} (${since})` : title;
  const divider = buildDivider(headerText, theme);

  const lines = [
    theme.section(headerText),
    divider,
    `${theme.muted("Rides:")} ${theme.accent(String(stats.count))}`,
    `${theme.muted("Distance:")} ${theme.accent(`${stats.distance}${units.distance ?? ""}`.trim())}`,
    `${theme.muted("Time:")} ${theme.accent(`${stats.time}${units.time ?? ""}`.trim())}`,
    `${theme.muted("Elevation:")} ${theme.accent(`${stats.elevation}${units.elevation ?? ""}`.trim())}`,
  ];

  return lines.join("\n");
};

export const renderTrainingSummary = ({ summary, theme = fallbackTheme }) => {
  const headerText = "Weekly Training Summary";
  const divider = buildDivider(headerText, theme);

  const lines = [
    theme.section(headerText),
    divider,
    `${theme.muted("Rides:")} ${theme.accent(String(summary.count))}`,
    `${theme.muted("Distance:")} ${theme.accent(`${summary.totalDistanceKm} km`)}`,
    `${theme.muted("Time:")} ${theme.accent(`${summary.totalHours} hours`)}`,
    `${theme.muted("Avg speed:")} ${theme.accent(`${summary.avgSpeedKph} km/h`)}`,
    `${theme.muted("Intensity:")} ${theme.accent(summary.intensity)}`,
    `${theme.muted("Weekly avg:")} ${theme.accent(`${summary.weeklyRides} rides`)}`,
    `${theme.muted("Recommendation:")} ${theme.good(summary.recommendation)}`,
  ];

  return lines.join("\n");
};

export const renderTrainingRecommendation = ({ recommendation, theme = fallbackTheme }) => {
  const headerText = "Training Recommendation";
  const divider = buildDivider(headerText, theme);

  const lines = [
    theme.section(headerText),
    divider,
    `${theme.muted("Suggestion:")} ${theme.accent(recommendation.suggestion)}`,
    `${theme.muted("Duration:")} ${theme.accent(recommendation.duration)}`,
    `${theme.muted("Tip:")} ${theme.accent(recommendation.tip)}`,
  ];

  if (recommendation.weather) {
    const weatherText = `${recommendation.weather.temp}°F, wind ${recommendation.weather.windSpeed} km/h`;
    lines.push(
      "",
      theme.section("Conditions"),
      `${theme.muted("Summary:")} ${theme.accent(weatherText)}`
    );

    if (recommendation.weather.concerns?.length > 0) {
      lines.push(`${theme.muted("Concerns:")} ${theme.warn(recommendation.weather.concerns.join(", "))}`);
    }
  }

  return lines.join("\n");
};

export const renderMaintenanceStatus = ({ status, theme = fallbackTheme }) => {
  const headerText = "Maintenance Status";
  const divider = buildDivider(headerText, theme);

  const lines = [theme.section(headerText), divider];

  status.components.forEach((component) => {
    const statusText = component.status;
    const coloredStatus = statusText === "overdue"
      ? theme.bad(statusText)
      : statusText === "due"
      ? theme.warn(statusText)
      : theme.good(statusText);

    lines.push(
      `${theme.muted(component.name + ":")} ${coloredStatus} ${theme.dim(`(${component.remaining}/${component.interval.km}km)`)}`
    );
  });

  if (status.recentEvents.length > 0) {
    lines.push("", theme.section("Recent Maintenance"));
    status.recentEvents.forEach((event) => {
      const date = new Date(event.occurredAt).toLocaleDateString();
      lines.push(`${theme.dim(date)} ${event.kind} (${event.metersAt}km)`);
    });
  }

  return lines.join("\n");
};

export const renderConfigSummary = ({ title, entries, theme = fallbackTheme }) => {
  const headerText = title;
  const divider = buildDivider(headerText, theme);
  const lines = [theme.section(headerText), divider];

  entries.forEach(({ label, value }) => {
    lines.push(`${theme.muted(label)} ${theme.accent(String(value))}`);
  });

  return lines.join("\n");
};

export const renderConfigChanges = ({ title, changes, theme = fallbackTheme }) => {
  const headerText = title;
  const divider = buildDivider(headerText, theme);
  const lines = [theme.section(headerText), divider];

  changes.forEach((change) => {
    lines.push(`${theme.good("✓")} ${change}`);
  });

  return lines.join("\n");
};

export const renderSectionHeader = ({ title, theme = fallbackTheme }) =>
  [theme.section(title), buildDivider(title, theme)].join("\n");

export const renderConfigValue = ({ key, value, theme = fallbackTheme }) =>
  `${theme.muted(`${key}=`)}${theme.accent(String(value))}`;

export const renderHint = ({ message, theme = fallbackTheme }) =>
  `${theme.muted(message)}`;
