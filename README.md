# bike-cli

A comprehensive cycling utility CLI tool that provides weather guidance, Strava integration, training recommendations, and maintenance tracking for cyclists.

## Features

- **Weather Guidance** - Get current and forecasted conditions with clothing and gear recommendations
- **Strava Integration** - Sync activities and bikes from your Strava account
- **Bike Management** - Track multiple bikes with maintenance intervals
- **Riding Statistics** - View weekly, monthly, and yearly riding stats
- **Maintenance Tracking** - Monitor component wear and schedule maintenance
- **Training Guidance** - Get personalized training recommendations based on your riding data

## Installation

```bash
# Install dependencies
npm install

# Link the CLI for global use
npm link
```

## Quick Start

```bash
# Initialize configuration (optional - set defaults)
bike config init

# Get current conditions with recommendations
bike now

# Set up Strava integration
bike config set strava.clientId YOUR_CLIENT_ID
bike config set strava.clientSecret YOUR_CLIENT_SECRET
bike auth login
bike sync
```

## Table of Contents

- [Commands](#commands)
  - [Weather Commands](#weather-commands)
  - [Configuration](#configuration)
  - [Strava Integration](#strava-integration)
  - [Bike Management](#bike-management)
  - [Statistics](#statistics)
  - [Maintenance Tracking](#maintenance-tracking)
  - [Training Guidance](#training-guidance)
- [Global Options](#global-options)
- [Output Formats](#output-formats)
- [Data Storage](#data-storage)
- [Strava Setup](#strava-setup)
- [Caching](#caching)

## Commands

### Weather Commands

#### `bike now` / `bike` (default)

Shows current conditions with wear and gear guidance.

```bash
bike now
bike now --location "Seattle, WA"
bike now --units metric --format json
```

Displays:
- Current temperature and "feels like" temperature
- Wind speed and direction
- Precipitation probability and amount
- Weather summary (clear sky, rain, etc.)
- Road status (dry/damp/wet)
- Confidence level
- Clothing recommendations
- Gear checklist
- Weather alerts
- Cycling tips
- Sunrise/sunset times
- Hourly forecast breakdown

#### `bike plan`

Plan for a future time.

```bash
bike plan --time "07:30"
bike plan --time "2025-01-20T08:00" --duration 120
bike plan --time "tomorrow 08:00" --location "Portland, OR"
```

The `--time` parameter accepts:
- `now` (default)
- `HH:MM` format (uses today's date)
- ISO date string (e.g., `2025-01-20T08:00`)
- Relative date strings (e.g., `tomorrow`, `next Monday`)

#### `bike wear`

Get clothing recommendations only.

```bash
bike wear
bike wear --location "Denver, CO" --units us
bike wear --format csv
```

#### `bike gear`

Get gear packing checklist only.

```bash
bike gear
bike gear --location "Austin, TX"
bike gear --format json
```

#### `bike route`

Get route conditions summary (simplified view).

```bash
bike route
bike route --location "Chicago, IL" --time "09:00"
```

### Configuration

#### `bike config init`

Interactively set default configuration values.

```bash
bike config init
```

Prompts for:
- Default location
- Units (us/metric)
- Rider profile

#### `bike config get <key>`

Read a single configuration value.

```bash
bike config get location
bike config get units
bike config get strava.clientId
```

#### `bike config set <key> <value>`

Set a configuration value.

```bash
bike config set location "San Francisco, CA"
bike config set units metric
bike config set profile commuter
bike config set defaultBikeId <uuid>
```

#### `bike config list`

List all configuration values.

```bash
bike config list
```

#### `bike config migrate`

Migrate configuration to the latest schema.

```bash
bike config migrate
```

This command updates your configuration file to include any new fields added in recent versions. It will:
- Set `dbPath` if missing
- Initialize `strava` object if missing
- Import Strava credentials from environment variables if set
- Initialize `defaultBikeId` if missing

### Strava Integration

#### `bike auth login`

Authenticate with Strava.

```bash
bike auth login
```

This command:
1. Opens a browser window with Strava's authorization page
2. Waits for you to authorize the app
3. Exchanges the authorization code for access and refresh tokens
4. Stores tokens securely in your data file

Required permissions:
- `activity:read_all` - Read all your activities
- `read` - Read your profile information

#### `bike auth status`

Check Strava authentication status.

```bash
bike auth status
```

Displays:
- Athlete ID
- Scopes granted
- Token expiration time
- Authentication status (Active/EXPIRED)

#### `bike auth logout`

Log out from Strava by deleting stored tokens.

```bash
bike auth logout
```

#### `bike sync`

Sync activities and bikes from Strava.

```bash
# Sync recent activities (last 30 days)
bike sync

# Full sync (last 365 days)
bike sync --full

# Sync activities since a specific date
bike sync --since 2025-01-01
```

The sync command:
- Downloads activities and gear from Strava
- Creates bike entries for each Strava bike
- Links activities to bikes by gear ID
- Stores all data locally

Output includes:
- Athlete information (name, location)
- Number of bikes synced
- Number of activities added
- Number of activities updated

### Bike Management

#### `bike bikes add <name>`

Add a new bike.

```bash
bike bikes add "Road Bike"
bike bikes add "Gravel Grinder" --type gravel
bike bikes add "Commuter" --type commuter --strava-gear-id g12345678
bike bikes add "Touring Bike" --type touring --notes "For long distance trips"
```

Options:
- `--type <type>` - Bike type: road, gravel, commuter, or touring
- `--strava-gear-id <id>` - Strava gear ID for syncing activities
- `--notes <notes>` - Additional notes about the bike

#### `bike bikes list`

List all bikes.

```bash
bike bikes list
```

Displays:
- Bike name and type
- Default marker
- Strava gear ID (if linked)
- Notes (if provided)

#### `bike bikes remove <id>`

Remove a bike.

```bash
bike bikes add "Test Bike"
# Copy the ID from the list command
bike bikes remove <uuid>
```

#### `bike bikes set-default <id>`

Set the default bike.

```bash
bike bikes set-default <uuid>
```

The default bike is used for:
- Statistics (when no `--bike` option specified)
- Maintenance tracking (when no `--bike` option specified)
- Training recommendations (when no `--bike` option specified)

#### `bike bikes rename <id> <name>`

Rename a bike.

```bash
bike bikes rename <uuid> "New Name"
```

### Statistics

#### `bike stats week`

View statistics for this week.

```bash
bike stats week
bike stats week --bike <uuid>
bike stats week --format json
```

Period: Sunday (00:00) to now.

#### `bike stats month`

View statistics for this month.

```bash
bike stats month
bike stats month --bike <uuid>
bike stats month --format csv
```

Period: 1st of the month to now.

#### `bike stats year`

View statistics for this year.

```bash
bike stats year
bike stats year --bike <uuid>
bike stats year --format json
```

Period: January 1st to now.

All stats commands display:
- Number of rides
- Total distance (km)
- Total time (hours)
- Total elevation gain (m)

**Note:** Statistics are calculated from synced Strava activities. You must run `bike sync` first to populate the data.

### Maintenance Tracking

#### `bike maintenance status`

Check maintenance status for bike components.

```bash
bike maintenance status
bike maintenance status --bike <uuid>
```

Displays:
- Component name and kind
- Installation mileage
- Current mileage
- Service interval
- Remaining mileage before service
- Status: good, due, or overdue
- Recent maintenance events

Tracked components and intervals:
- Chain: 3,200 km or 200 hours
- Tires: 3,200 km or 200 hours
- Brake pads: 3,200 km or 200 hours
- Cassette: 8,000 km or 400 hours
- Cables: 16,000 km or 800 hours
- Bottom bracket: 16,000 km or 800 hours

#### `bike maintenance log`

Log a maintenance event.

```bash
bike maintenance log --kind chain --component <uuid> --meters-at 32000
bike maintenance log --kind tires --meters-at 32000 --notes "Replaced front tire"
bike maintenance log --kind chain --bike <uuid> --meters-at 32000
```

Options:
- `--bike <id>` - Bike ID (optional, uses default if not specified)
- `--kind <kind>` - Maintenance kind: chain, tires, brake_pads, cassette, cables, bottom_bracket
- `--component <id>` - Component ID (optional)
- `--meters-at <meters>` - Current odometer reading in meters
- `--notes <notes>` - Additional notes about the maintenance

**Note:** You need to manually track mileage for now. Future versions will automatically calculate this from Strava activities.

### Training Guidance

#### `bike training summary`

Get a weekly training summary.

```bash
bike training summary
bike training summary --bike <uuid>
bike training summary --since 2025-01-01
bike training summary --format json
```

Displays:
- Number of rides
- Total distance (km)
- Total time (hours)
- Average speed (km/h)
- Elevation gain (km)
- Intensity level: easy, moderate, or hard
- Weekly average rides
- Recommendation summary

#### `bike training recommend`

Get a personalized training recommendation.

```bash
bike training recommend
bike training recommend --bike <uuid>
bike training recommend --no-weather
```

Displays:
- Suggested ride type (easy ride, tempo intervals, recovery ride, etc.)
- Recommended duration
- Training tip
- Weather considerations (if not using `--no-weather`)

The recommendation considers:
- Your recent riding history
- Current weather conditions
- Your selected bike's type

## Global Options

These options apply to weather commands (`now`, `plan`, `wear`, `gear`, `route`):

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --location <location>` | Location to check (city, state, country) | Config default or "Brooklyn" |
| `--time <time>` | Time to plan for | `now` |
| `--duration <minutes>` | Duration in minutes (for planning) | - |
| `--units <units>` | Units: `us` or `metric` | Config default or `us` |
| `--profile <profile>` | Rider profile | Config default or `commuter` |
| `--format <format>` | Output format: `text`, `json`, or `csv` | `text` |
| `--ttl <minutes>` | Cache TTL in minutes | 60 |
| `--no-color` | Disable colored output | Enabled in TTY |
| `--quiet` | Minimal output | Full output |
| `--interactive` | Prompt for missing info | No prompts |
| `--no-emoji` | Disable emoji in output | Enabled |

### Units

- **US** (default): Temperature in °F, wind speed in mph, precipitation in inches
- **metric**: Temperature in °C, wind speed in km/h, precipitation in mm

### Time Formats

The `--time` option accepts multiple formats:

```bash
--time now                 # Current time (default)
--time 07:30              # Today at 7:30 AM
--time 14:00              # Today at 2:00 PM
--time 2025-01-20T08:00   # Specific date/time
--time tomorrow 09:00      # Tomorrow at 9:00 AM
--time "next Monday 07:00" # Next Monday at 7:00 AM
```

## Output Formats

### Text Format (default)

Human-readable, color-coded output with sections and formatting.

```bash
bike now
bike plan --time 08:00
```

### JSON Format

Machine-readable JSON output.

```bash
bike now --format json
bike wear --format json
bike stats week --format json
```

JSON structure for weather commands:

```json
{
  "mode": "now",
  "location": "Brooklyn, New York, United States",
  "time": "2025-01-18T14:00",
  "summary": "Partly cloudy",
  "temperature": 45,
  "feelsLike": 42,
  "windSpeed": 12,
  "windDirection": "NW",
  "precipProbability": 20,
  "precipitation": 0.01,
  "units": {
    "temperature": "°F",
    "windSpeed": "mph",
    "precipitation": "in"
  },
  "wear": [
    "Arm warmers",
    "Knee warmers",
    "Long-finger gloves"
  ],
  "bring": [
    "Windbreaker",
    "Spare tube",
    "Mini pump/CO2",
    "Multi-tool"
  ],
  "alerts": [],
  "tips": [
    "Start with a warm-up if temp < 50°F",
    "Check tire pressure before riding"
  ],
  "daylight": {
    "sunrise": "07:15",
    "sunset": "17:00",
    "warning": null
  },
  "hourly": [...],
  "confidence": "high",
  "roadStatus": "dry"
}
```

### CSV Format

Comma-separated values for data processing.

```bash
bike now --format csv
bike wear --format csv
bike gear --format csv
```

CSV structure for full weather output:

```csv
location,time,summary,temperature,feelsLike,windSpeed,windDirection,precipProbability,precipitation
Brooklyn, New York, United States,2025-01-18T14:00,Partly cloudy,45,42,12,NW,20,0.01
```

CSV structure for wear/gear:

```csv
Arm warmers,Knee warmers,Long-finger gloves
```

## Data Storage

### Configuration

Stored in: `~/.config/bike-cli/config.json`

```json
{
  "location": "Brooklyn",
  "units": "us",
  "profile": "commuter",
  "dbPath": null,
  "defaultBikeId": "uuid-of-default-bike",
  "strava": {
    "clientId": "your-strava-client-id",
    "clientSecret": "your-strava-client-secret",
    "redirectUri": "http://127.0.0.1:8888/callback"
  }
}
```

### Data

Stored in: `~/.config/bike-cli/data.json`

```json
{
  "meta": {
    "version": "001",
    "createdAt": "2025-01-18T10:00:00.000Z"
  },
  "stravaTokens": [
    {
      "athleteId": 12345,
      "accessToken": "access-token-string",
      "refreshToken": "refresh-token-string",
      "expiresAt": 1737230400,
      "scopes": "activity:read_all,read",
      "createdAt": "2025-01-18T10:00:00.000Z",
      "updatedAt": "2025-01-18T10:00:00.000Z"
    }
  ],
  "bikes": [
    {
      "id": "bike-uuid",
      "name": "Road Bike",
      "type": "road",
      "stravaGearId": "g12345678",
      "isDefault": true,
      "notes": "My main road bike",
      "createdAt": "2025-01-18T10:00:00.000Z",
      "updatedAt": "2025-01-18T10:00:00.000Z"
    }
  ],
  "activities": [
    {
      "id": 12345678901234,
      "athleteId": 12345,
      "bikeId": "bike-uuid",
      "stravaGearId": "g12345678",
      "startDate": "2025-01-15T10:00:00.000Z",
      "distanceM": 50000,
      "movingTimeS": 5400,
      "elapsedTimeS": 6000,
      "elevGainM": 500,
      "averageSpeedMps": 9.26,
      "type": "Ride",
      "rawJson": "{...}"
    }
  ],
  "components": [],
  "maintenanceEvents": []
}
```

## Strava Setup

### Creating a Strava App

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Click "Create Your API Application"
3. Fill in the form:
   - **Application Name**: `bike-cli` (or your preferred name)
   - **Category**: `Other`
   - **Club Type**: `Cycling`
   - **Website**: `http://localhost` (or your website)
   - **Application Description**: `Cycling utility CLI for weather, stats, and maintenance`
   - **Authorization Callback Domain**: `localhost`
4. Click "Create"
5. Copy your **Client ID** and **Client Secret**

### Configuring bike-cli

Option 1: Using config file

```bash
bike config set strava.clientId YOUR_CLIENT_ID
bike config set strava.clientSecret YOUR_CLIENT_SECRET
```

Option 2: Using environment variables

```bash
export BIKE_STRAVA_CLIENT_ID=YOUR_CLIENT_ID
export BIKE_STRAVA_CLIENT_SECRET=YOUR_CLIENT_SECRET
```

Environment variables take precedence over config file values.

### Authenticating

```bash
bike auth login
```

1. The CLI will display a URL
2. Open the URL in your browser
3. Log in to Strava (if not already logged in)
4. Authorize the application
5. Return to the terminal - you'll see your athlete information

### Syncing Data

```bash
# Sync recent activities (last 30 days)
bike sync

# Full sync (last 365 days)
bike sync --full

# Sync since a specific date
bike sync --since 2025-01-01
```

The sync will:
- Download all your bikes from Strava
- Create bike entries if they don't exist
- Download activities within the date range
- Link activities to bikes by gear ID
- Store all data locally

## Caching

### Location Caching

Geocoding results are cached to avoid repeated API calls. Location cache is stored in the data file and persists between sessions.

### Weather Caching

Weather data is cached with a configurable TTL (default: 60 minutes).

```bash
# Use default TTL (60 minutes)
bike now

# Use custom TTL
bike now --ttl 120    # Cache for 2 hours
bike now --ttl 15     # Cache for 15 minutes
```

Cached weather data:
- Coordinates
- Units used
- Timestamp
- Weather data (current, hourly, daily)

Cache is automatically refreshed when:
- TTL expires
- Units change
- Location changes

The CLI will display "Using cached weather" or "Weather synced" to indicate cache status.

## Examples

### Before a morning ride

```bash
# Check conditions for 7 AM ride
bike plan --time 07:00

# Just get the clothing checklist
bike wear --time 07:00 --quiet

# See if roads are dry or wet
bike route
```

### Planning a week of rides

```bash
# Sync recent Strava data
bike sync

# Check your weekly stats
bike stats week

# Get training recommendation
bike training recommend

# Plan tomorrow's ride
bike plan --time "tomorrow 07:00"
```

### Setting up maintenance tracking

```bash
# Add your bike
bike bikes add "Road Bike" --type road --strava-gear-id g12345678

# Set as default
bike bikes list
bike bikes set-default <uuid>

# Log a chain replacement
bike maintenance log --kind chain --meters-at 32000 --notes "New chain installed"

# Check maintenance status
bike maintenance status
```

### Using different output formats

```bash
# Get data for a script
bike now --format json | jq '.temperature'

# Export wear recommendations to CSV
bike wear --format csv > wear.csv

# Get stats for spreadsheet
bike stats month --format csv > stats.csv
```

## Requirements

- Node.js 18.0.0 or higher

## Dependencies

- **boxen** - Box drawing for CLI output
- **chalk** - Terminal string styling
- **cli-table3** - Tables for CLI output
- **commander** - Command-line interface framework
- **ora** - Elegant terminal spinner
- **sql.js** - SQLite for local data storage (future use)

## Weather Data Source

Weather data is provided by [Open-Meteo](https://open-meteo.com/), a free and open-source weather API. No API key required.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
