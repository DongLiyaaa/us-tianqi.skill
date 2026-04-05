import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { getInsight, personas, states, tierLabel } from "./demand-engine.mjs";
import { stateCentroids } from "./state-centroids.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = normalize(join(__filename, ".."));
const weatherCache = {};
const fileCacheDir = join(__dirname, ".cache", "weather");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function notFound(res, message = "Not found") {
  json(res, 404, { error: message });
}

function normalizeBaseUrl(baseUrl = "") {
  const trimmed = String(baseUrl).trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/chat/completions`;
}

function extractJsonObject(text) {
  const content = String(text || "").trim();
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(content.slice(start, end + 1));
  }
  return JSON.parse(content);
}

async function requestModel({ baseUrl, modelId, apiKey, messages, maxTokens = 200 }) {
  const endpoint = normalizeBaseUrl(baseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  }

  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content || "";
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date, offset) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy;
}

function slugKey(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function ensureCacheDir() {
  await mkdir(fileCacheDir, { recursive: true });
}

async function readCacheFile(filePath, ttlMs, force) {
  if (force) {
    return null;
  }

  try {
    const meta = await stat(filePath);
    if (ttlMs !== null && Date.now() - meta.mtimeMs > ttlMs) {
      return null;
    }
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCacheFile(filePath, payload) {
  await ensureCacheDir();
  await writeFile(filePath, JSON.stringify(payload));
}

async function fetchJsonWithCache(key, url, { ttlMs = 6 * 60 * 60 * 1000, force = false } = {}) {
  const filePath = join(fileCacheDir, `${slugKey(key)}.json`);
  const cached = await readCacheFile(filePath, ttlMs, force);
  if (cached) {
    return cached;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  await writeCacheFile(filePath, payload);
  return payload;
}

function mean(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  return Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(2));
}

function mode(values) {
  const counts = new Map();
  values.forEach((value) => {
    if (Number.isFinite(value)) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  });
  let winner = null;
  let max = -1;
  counts.forEach((count, value) => {
    if (count > max) {
      max = count;
      winner = value;
    }
  });
  return winner;
}

function pickCoords(stateKey) {
  const coords = stateCentroids[stateKey];
  if (!coords) {
    throw new Error(`Missing centroid coordinates for state: ${stateKey}`);
  }
  return coords;
}

function buildHourlyRows(payload) {
  const hourly = payload.hourly;
  return hourly.time.map((time, index) => ({
    time,
    temperature: hourly.temperature_2m[index],
    apparentTemperature: hourly.apparent_temperature[index],
    humidity: hourly.relative_humidity_2m[index],
    weatherCode: hourly.weather_code[index]
  }));
}

function buildDailyRows(payload) {
  const daily = payload.daily;
  return daily.time.map((time, index) => ({
    time,
    temperature: daily.temperature_2m_mean[index],
    apparentTemperature: daily.apparent_temperature_mean[index],
    humidity: daily.relative_humidity_2m_mean[index],
    weatherCode: daily.weather_code[index]
  }));
}

function aggregateMonthly(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const month = row.time.slice(0, 7);
    if (!grouped.has(month)) {
      grouped.set(month, []);
    }
    grouped.get(month).push(row);
  });

  return Array.from(grouped.entries()).map(([time, values]) => ({
    time,
    temperature: mean(values.map((value) => value.temperature)),
    apparentTemperature: mean(values.map((value) => value.apparentTemperature)),
    humidity: mean(values.map((value) => value.humidity)),
    weatherCode: mode(values.map((value) => value.weatherCode))
  }));
}

function averageRows(rows) {
  return {
    temperature: mean(rows.map((row) => row.temperature)),
    apparentTemperature: mean(rows.map((row) => row.apparentTemperature)),
    humidity: mean(rows.map((row) => row.humidity)),
    weatherCode: mode(rows.map((row) => row.weatherCode))
  };
}

function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function buildSevenDayComparison(dailyRows, today) {
  const currentYear = today.getUTCFullYear();
  const years = Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);

  return years.map((year) => {
    const anchor = new Date(Date.UTC(year, today.getUTCMonth(), today.getUTCDate()));
    const end = formatDate(anchor);
    const start = formatDate(shiftDays(anchor, -6));
    const previousStart = formatDate(shiftDays(anchor, -13));
    const previousEnd = formatDate(shiftDays(anchor, -7));

    const currentWindow = dailyRows.filter((row) => row.time >= start && row.time <= end);
    const previousWindow = dailyRows.filter((row) => row.time >= previousStart && row.time <= previousEnd);
    const previousYearWindow = dailyRows.filter((row) => {
      const compareDate = new Date(`${row.time}T00:00:00Z`);
      return compareDate.getUTCFullYear() === year - 1 &&
        row.time >= formatDate(shiftDays(new Date(Date.UTC(year - 1, today.getUTCMonth(), today.getUTCDate())), -6)) &&
        row.time <= formatDate(new Date(Date.UTC(year - 1, today.getUTCMonth(), today.getUTCDate())));
    });

    const currentAverages = averageRows(currentWindow);
    const previousAverages = averageRows(previousWindow);
    const previousYearAverages = averageRows(previousYearWindow);

    return {
      time: String(year),
      temperature: currentAverages.temperature,
      apparentTemperature: currentAverages.apparentTemperature,
      humidity: currentAverages.humidity,
      weatherCode: currentAverages.weatherCode,
      comparisons: {
        temperatureYoY: percentChange(currentAverages.temperature, previousYearAverages.temperature),
        temperatureYoYValue: previousYearAverages.temperature,
        temperatureMoM: percentChange(currentAverages.temperature, previousAverages.temperature),
        temperatureMoMValue: previousAverages.temperature,
        apparentTemperatureYoY: percentChange(currentAverages.apparentTemperature, previousYearAverages.apparentTemperature),
        apparentTemperatureYoYValue: previousYearAverages.apparentTemperature,
        apparentTemperatureMoM: percentChange(currentAverages.apparentTemperature, previousAverages.apparentTemperature),
        apparentTemperatureMoMValue: previousAverages.apparentTemperature,
        humidityYoY: percentChange(currentAverages.humidity, previousYearAverages.humidity),
        humidityYoYValue: previousYearAverages.humidity,
        humidityMoM: percentChange(currentAverages.humidity, previousAverages.humidity),
        humidityMoMValue: previousAverages.humidity
      }
    };
  });
}

async function getTimeSeries(stateKey, force = false) {
  const state = states.find((item) => item.key === stateKey);
  if (!state) {
    throw new Error(`Unknown state: ${stateKey}`);
  }

  const { latitude, longitude } = pickCoords(stateKey);
  const today = new Date();
  const todayLabel = formatDate(today);
  const start30 = formatDate(shiftDays(today, -29));
  const start5Years = formatDate(shiftDays(today, -365 * 5));

  const hourlyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&timezone=auto&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&past_hours=24&forecast_hours=0`;
  const dailyUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&timezone=auto&start_date=${start5Years}&end_date=${todayLabel}&daily=temperature_2m_mean,apparent_temperature_mean,relative_humidity_2m_mean,weather_code`;

  const [hourlyPayload, dailyPayload] = await Promise.all([
    fetchJsonWithCache(`hourly-${stateKey}-${todayLabel}`, hourlyUrl, { ttlMs: 30 * 60 * 1000, force }),
    fetchJsonWithCache(`daily-${stateKey}-${start5Years}-${todayLabel}`, dailyUrl, { ttlMs: 24 * 60 * 60 * 1000, force })
  ]);

  const dayRows = buildHourlyRows(hourlyPayload).slice(-24);
  const dailyRows = buildDailyRows(dailyPayload);
  const weekRows = dailyRows.slice(-7);
  const monthRows = dailyRows.filter((row) => row.time >= start30);
  const yearRows = aggregateMonthly(dailyRows).slice(-60);
  const compare7yRows = buildSevenDayComparison(dailyRows, today);

  return {
    state,
    source: {
      hourly: "Open-Meteo Forecast API",
      historical: "Open-Meteo Historical Weather API"
    },
    units: {
      temperature: "°C",
      apparentTemperature: "°C",
      humidity: "%",
      weatherCode: "WMO code"
    },
    ranges: {
      day: dayRows,
      week: weekRows,
      month: monthRows,
      compare7y: compare7yRows,
      years: yearRows
    }
  };
}

function validStaticPath(pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = normalize(join(__dirname, safePath));
  return resolved.startsWith(__dirname) ? resolved : null;
}

async function serveStatic(req, res, pathname) {
  const filePath = validStaticPath(pathname);
  if (!filePath) {
    return notFound(res);
  }

  try {
    const body = await readFile(filePath);
    const type = contentTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    notFound(res);
  }
}

async function handleInsight(req, res, url) {
  const requestedState = (url.searchParams.get("state") || "california").toLowerCase();
  const requestedPersona = (url.searchParams.get("persona") || "cold_chain").toLowerCase();

  try {
    const result = await getInsight(requestedState, requestedPersona, weatherCache);
    json(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      state: result.state,
      persona: result.persona,
      weather: result.weather,
      signal: {
        level: result.insight.level,
        label: tierLabel(result.insight.level),
        intensity: result.meters.intensity,
        velocity: result.meters.velocity
      },
      demand: {
        current: result.insight.current,
        incremental: result.insight.incremental,
        rising: result.insight.rising
      }
    });
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: error.message,
      validStates: states.map((state) => state.key),
      validPersonas: personas.map((persona) => persona.key)
    });
  }
}

async function handleStates(_req, res) {
  json(res, 200, { ok: true, states, personas });
}

async function handleTimeSeries(_req, res, url) {
  const requestedState = (url.searchParams.get("state") || "california").toLowerCase();
  const force = url.searchParams.get("force") === "1";

  try {
    const payload = await getTimeSeries(requestedState, force);
    json(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      state: payload.state,
      source: payload.source,
      units: payload.units,
      ranges: payload.ranges
    });
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: error.message,
      validStates: states.map((state) => state.key)
    });
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    return notFound(res);
  }

  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${port}`}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (!["GET", "HEAD", "POST"].includes(req.method)) {
    return json(res, 405, { error: "Method not allowed" });
  }

  if (url.pathname === "/api/health") {
    return json(res, 200, { ok: true, service: "seasonal-demand-api", date: new Date().toISOString() });
  }

  if (url.pathname === "/api/meta") {
    return handleStates(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/model/test") {
    try {
      const { baseUrl, modelId, apiKey } = await readJsonBody(req);
      if (!baseUrl || !modelId || !apiKey) {
        return json(res, 400, { ok: false, error: "缺少 Base URL、模型 ID 或密钥。" });
      }

      await requestModel({
        baseUrl,
        modelId,
        apiKey,
        maxTokens: 32,
        messages: [
          { role: "system", content: "You are a connectivity checker." },
          { role: "user", content: 'Reply with plain text "ok".' }
        ]
      });

      return json(res, 200, { ok: true, message: "连接成功" });
    } catch (error) {
      return json(res, 200, {
        ok: false,
        message: "连接失败",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/model/analyze") {
    try {
      const { baseUrl, modelId, apiKey, viewModel } = await readJsonBody(req);
      if (!baseUrl || !modelId || !apiKey || !viewModel) {
        return json(res, 400, { ok: false, error: "缺少模型配置或分析数据。" });
      }

      const prompt = [
        "你是季节性产品分析助手。",
        "请根据天气和场景输出 JSON，不要输出任何额外文字。",
        'JSON 格式: {"level":"current|incremental|rising|declining","current":"...","incremental":"...","rising":"...","declining":"..."}',
        "要求：四段文案必须使用简体中文，每段不超过100字，具体可执行。",
        `州: ${viewModel.state.name}`,
        `城市: ${viewModel.state.query}`,
        `场景: ${viewModel.persona.label}`,
        `场景说明: ${viewModel.persona.description}`,
        `温度: ${viewModel.weather.tempC}°C`,
        `体感温度: ${viewModel.weather.feelsLikeC}°C`,
        `湿度: ${viewModel.weather.humidity}%`,
        `天气: ${viewModel.weather.desc}`,
        `风速: ${viewModel.weather.windKmph} km/h`,
        `降水: ${viewModel.weather.precipMm} mm`
      ].join("\n");

      const content = await requestModel({
        baseUrl,
        modelId,
        apiKey,
        maxTokens: 600,
        messages: [
          { role: "system", content: "你只返回合法 JSON。" },
          { role: "user", content: prompt }
        ]
      });

      return json(res, 200, { ok: true, insight: extractJsonObject(content) });
    } catch (error) {
      return json(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  if (url.pathname === "/api/insight") {
    return handleInsight(req, res, url);
  }

  if (url.pathname === "/api/timeseries") {
    return handleTimeSeries(req, res, url);
  }

  return serveStatic(req, res, url.pathname);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
});
