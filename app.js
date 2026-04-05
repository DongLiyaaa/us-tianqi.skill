import {
  buildCustomPersona,
  getCustomInsight,
  getInsight,
  personas,
  states,
  tierLabel
} from "./demand-engine.mjs";
import usaMapData from "./usa-map-data.js";

const weatherCache = {};
const insightCache = {};
const timeSeriesCache = {};
const modelInsightCache = {};
const modelInsightPendingCache = {};
const resolvedInsightCache = {};
const storageKeys = {
  modelConfig: "seasonal-demand:model-config",
  customPersona: "seasonal-demand:custom-persona",
  customPersonaList: "seasonal-demand:custom-persona-list",
  modelInsightCache: "seasonal-demand:model-insight-cache-v2"
};

const appState = {
  activeState: "california",
  activePersona: "cold_chain"
};

const mapRoot = document.getElementById("mapRoot");
const mapFrame = document.getElementById("mapFrame");
const personaGrid = document.getElementById("personaGrid");
const openModelConfig = document.getElementById("openModelConfig");
const modelConfigModal = document.getElementById("modelConfigModal");
const closeModelConfig = document.getElementById("closeModelConfig");
const modelConfigForm = document.getElementById("modelConfigForm");
const clearModelConfig = document.getElementById("clearModelConfig");
const testModelConfig = document.getElementById("testModelConfig");
const customPersonaForm = document.getElementById("customPersonaForm");
const customPersonaLabelInput = document.getElementById("customPersonaLabel");
const customPersonaDescriptionInput = document.getElementById("customPersonaDescription");
const refreshWeatherButton = document.getElementById("refreshWeather");
const analysisOverlay = document.getElementById("analysisOverlay");
const analysisOverlayText = document.getElementById("analysisOverlayText");
const chartContainers = {
  day: document.getElementById("chartDay"),
  week: document.getElementById("chartWeek"),
  month: document.getElementById("chartMonth"),
  compare7y: document.getElementById("chartCompare7y"),
  years: document.getElementById("chartYears")
};

const activeStateLabel = document.getElementById("activeStateLabel");
const detailTitle = document.getElementById("detailTitle");
const sourceStatus = document.getElementById("sourceStatus");
const modelConfigStatus = document.getElementById("modelConfigStatus");
const modelConnectionInline = document.getElementById("modelConnectionInline");
const modelConnectionStatus = document.getElementById("modelConnectionStatus");
const modelTestFeedback = document.getElementById("modelTestFeedback");
const modelReminder = document.getElementById("modelReminder");
const decisionOutputSummary = document.getElementById("decisionOutputSummary");
const dataTimeNote = document.getElementById("dataTimeNote");
const signalLevel = document.getElementById("signalLevel");
const weatherBadge = document.getElementById("weatherBadge");
const spotlightTitle = document.getElementById("spotlightTitle");
const intensityBar = document.getElementById("intensityBar");
const velocityBar = document.getElementById("velocityBar");
const tempValue = document.getElementById("tempValue");
const conditionValue = document.getElementById("conditionValue");
const feelsValue = document.getElementById("feelsValue");
const currentDemand = document.getElementById("currentDemand");
const incrementalDemand = document.getElementById("incrementalDemand");
const risingDemand = document.getElementById("risingDemand");
const decliningDemand = document.getElementById("decliningDemand");

const stateByKey = Object.fromEntries(states.map((state) => [state.key, state]));
const stateKeyByMapId = Object.fromEntries(states.map((state) => [state.mapId, state.key]));
let customPersona = loadCustomPersona();
let customPersonas = loadCustomPersonas();
let activeTimeSeries = null;
let latestModelConnectionState = "unknown";
let syncRunId = 0;
let analysisOverlayDepth = 0;
let activeAnalysisStateName = "";

const seriesMeta = [
  { key: "temperature", label: "温度", className: "line-temp", color: "#d26f31" },
  { key: "apparentTemperature", label: "体感温度", className: "line-feels", color: "#b6902f" },
  { key: "humidity", label: "湿度", className: "line-humidity", color: "#2f7a53" }
];

const weatherCodeLabels = {
  0: "晴朗",
  1: "基本晴",
  2: "局部多云",
  3: "阴天",
  45: "雾",
  48: "冻雾",
  51: "小毛毛雨",
  53: "中毛毛雨",
  55: "大毛毛雨",
  56: "冻毛毛雨",
  57: "强冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "强冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "小阵雨",
  81: "中阵雨",
  82: "强阵雨",
  85: "小阵雪",
  86: "强阵雪",
  95: "雷暴",
  96: "雷暴夹小冰雹",
  99: "雷暴夹大冰雹"
};

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
  return value;
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    return null;
  }
  return null;
}

function loadModelConfig() {
  const raw = readStorage(storageKeys.modelConfig);
  if (!raw) {
    return { baseUrl: "", modelId: "", apiKey: "" };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { baseUrl: "", modelId: "", apiKey: "" };
  }
}

function hasModelConfig(config = loadModelConfig()) {
  return Boolean(config.baseUrl && config.modelId && config.apiKey);
}

function saveModelConfig(config) {
  writeStorage(storageKeys.modelConfig, JSON.stringify(config));
}

function loadPersistedModelInsightCache() {
  const raw = readStorage(storageKeys.modelInsightCache);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(modelInsightCache, parsed);
    }
  } catch {
    removeStorage(storageKeys.modelInsightCache);
  }
}

function persistModelInsightCache() {
  writeStorage(storageKeys.modelInsightCache, JSON.stringify(modelInsightCache));
}

function getDraftModelConfig() {
  return {
    baseUrl: modelConfigForm.baseUrl.value.trim(),
    modelId: modelConfigForm.modelId.value.trim(),
    apiKey: modelConfigForm.apiKey.value.trim()
  };
}

function loadCustomPersona() {
  const raw = readStorage(storageKeys.customPersona);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.label) {
      return null;
    }
    return buildCustomPersona(parsed.label, parsed.description);
  } catch {
    return null;
  }
}

function slugifyCustomPersonaLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "custom";
}

function buildCustomPersonaRecord(label, description, key = "") {
  const persona = buildCustomPersona(label, description);
  return {
    ...persona,
    key: key || `custom_user_defined_${slugifyCustomPersonaLabel(label)}_${Date.now().toString(36)}`
  };
}

function loadCustomPersonas() {
  const rawList = readStorage(storageKeys.customPersonaList);
  if (rawList) {
    try {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => item?.label)
          .map((item) => buildCustomPersonaRecord(item.label, item.description, item.key));
      }
    } catch {
      removeStorage(storageKeys.customPersonaList);
    }
  }

  const legacyPersona = loadCustomPersona();
  if (!legacyPersona) {
    return [];
  }
  const migrated = [buildCustomPersonaRecord(legacyPersona.label, legacyPersona.description, legacyPersona.key)];
  saveCustomPersonas(migrated);
  removeStorage(storageKeys.customPersona);
  return migrated;
}

function saveCustomPersona(persona) {
  writeStorage(
    storageKeys.customPersona,
    JSON.stringify({ label: persona.label, description: persona.description })
  );
}

function saveCustomPersonas(personaList) {
  writeStorage(
    storageKeys.customPersonaList,
    JSON.stringify(personaList.map((persona) => ({
      key: persona.key,
      label: persona.label,
      description: persona.description
    })))
  );
}

function clearResolvedInsightCache(prefix = "") {
  Object.keys(resolvedInsightCache)
    .filter((key) => !prefix || key.startsWith(prefix))
    .forEach((key) => {
      delete resolvedInsightCache[key];
    });
}

function clearModelAnalysisCache() {
  Object.keys(modelInsightCache).forEach((key) => {
    delete modelInsightCache[key];
  });
  Object.keys(modelInsightPendingCache).forEach((key) => {
    delete modelInsightPendingCache[key];
  });
  removeStorage(storageKeys.modelInsightCache);
}

function getInsightStateKey(personaKey, stateKey) {
  return `${personaKey}:${stateKey}`;
}

function getResolvedInsight(stateKey, personaKey = appState.activePersona) {
  return resolvedInsightCache[getInsightStateKey(personaKey, stateKey)] || null;
}

function setResolvedInsight(stateKey, personaKey, insight) {
  resolvedInsightCache[getInsightStateKey(personaKey, stateKey)] = insight;
}

function isStateResolved(stateKey, personaKey = appState.activePersona) {
  return Boolean(getResolvedInsight(stateKey, personaKey));
}

function getPersonaOptions() {
  return [...personas, ...customPersonas];
}

function renderUsMap() {
  const namespace = "http://www.w3.org/2000/svg";
  const labelOverrides = {
    dc: { dx: 22, dy: -4, anchor: "start" },
    de: { dx: 22, dy: 2, anchor: "start" },
    md: { dx: 26, dy: 8, anchor: "start" },
    nj: { dx: 24, dy: -8, anchor: "start" },
    ct: { dx: 24, dy: -2, anchor: "start" },
    ri: { dx: 28, dy: 4, anchor: "start" },
    ma: { dx: 24, dy: -10, anchor: "start" },
    vt: { dx: 18, dy: -10, anchor: "start" },
    nh: { dx: 22, dy: -2, anchor: "start" }
  };
  const svg = document.createElementNS(namespace, "svg");
  const defs = document.createElementNS(namespace, "defs");
  defs.innerHTML = `
    <linearGradient id="mapGlow" x1="0%" x2="100%">
      <stop offset="0%" stop-color="#f6e8b1"></stop>
      <stop offset="50%" stop-color="#d8e7d0"></stop>
      <stop offset="100%" stop-color="#9ec5c3"></stop>
    </linearGradient>
  `;
  svg.appendChild(defs);

  const lower48Group = document.createElementNS(namespace, "g");
  const labelGroup = document.createElementNS(namespace, "g");
  labelGroup.setAttribute("class", "state-label-layer");
  const labelEntries = [];

  usaMapData.locations
    .forEach((location) => {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("d", location.path);
      path.setAttribute("data-map-id", location.id);
      path.setAttribute("data-state-name", location.name);
      path.setAttribute("tabindex", "0");
      path.setAttribute("class", "usa-state");
      path.setAttribute("role", "button");
      path.addEventListener("click", () => {
        const selectedStateKey = stateKeyByMapId[location.id];
        if (selectedStateKey) {
          handleStateSelection(selectedStateKey);
        }
      });
      path.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const selectedStateKey = stateKeyByMapId[location.id];
          if (selectedStateKey) {
            handleStateSelection(selectedStateKey);
          }
        }
      });
      lower48Group.appendChild(path);
      labelEntries.push({ location, path });
    });

  svg.appendChild(lower48Group);
  svg.appendChild(labelGroup);
  mapFrame.innerHTML = "";
  mapFrame.appendChild(svg);

  labelEntries.forEach(({ location, path }) => {
    const bbox = path.getBBox();
    const baseX = bbox.x + (bbox.width / 2);
    const baseY = bbox.y + (bbox.height / 2);
    const override = labelOverrides[location.id];
    const labelX = override ? baseX + override.dx : baseX;
    const labelY = override ? baseY + override.dy : baseY;
    if (override) {
      const leader = document.createElementNS(namespace, "line");
      leader.setAttribute("x1", String(baseX));
      leader.setAttribute("y1", String(baseY));
      leader.setAttribute("x2", String(labelX));
      leader.setAttribute("y2", String(labelY));
      leader.setAttribute("class", "usa-state-label-line");
      leader.setAttribute("pointer-events", "none");
      labelGroup.appendChild(leader);
    }
    const label = document.createElementNS(namespace, "text");
    label.setAttribute("x", String(labelX));
    label.setAttribute("y", String(labelY));
    label.setAttribute("class", "usa-state-label");
    label.setAttribute("text-anchor", override?.anchor || "middle");
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("pointer-events", "none");
    label.textContent = location.id.toUpperCase();
    labelGroup.appendChild(label);
  });

  const bbox = lower48Group.getBBox();
  const paddingX = 24;
  const paddingY = 18;
  svg.setAttribute(
    "viewBox",
    `${bbox.x - paddingX} ${bbox.y - paddingY} ${bbox.width + paddingX * 2} ${bbox.height + paddingY * 2}`
  );
}

async function getCachedInsight(stateKey, personaKey) {
  const cacheKey = `${personaKey}:${stateKey}`;
  if (insightCache[cacheKey]) {
    return insightCache[cacheKey];
  }

  const customPersona = customPersonas.find((persona) => persona.key === personaKey);
  const viewModel = customPersona
    ? await getCustomInsight(stateKey, customPersona, weatherCache)
    : await getInsight(stateKey, personaKey, weatherCache);
  insightCache[cacheKey] = viewModel;
  return viewModel;
}

function limitText(text, maxLength = 100) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}…`;
}

function limitInsightText(insight) {
  return {
    ...insight,
    current: limitText(insight.current),
    incremental: limitText(insight.incremental),
    rising: limitText(insight.rising),
    declining: limitText(insight.declining || "当前暂无明显下行压力，可继续观察价格、天气与搜索热度变化。")
  };
}

function getDecisionOutputLabels() {
  return ["当前需求", "增量", "起量前夜", "市场下行"];
}

function renderDecisionOutputSummary() {
  decisionOutputSummary.textContent = getDecisionOutputLabels().join(" / ");
}

function getTierClass(level) {
  if (level === "current") {
    return "tier-hot";
  }
  if (level === "incremental") {
    return "tier-warm";
  }
  if (level === "declining") {
    return "tier-down";
  }
  return "tier-cool";
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/chat/completions`;
}

function buildModelInsightCacheKey(viewModel, config = loadModelConfig()) {
  return JSON.stringify({
    baseUrl: normalizeBaseUrl(config.baseUrl),
    modelId: config.modelId,
    state: viewModel.state.key,
    persona: {
      key: viewModel.persona.key,
      label: viewModel.persona.label,
      description: viewModel.persona.description
    },
    weather: {
      tempC: viewModel.weather.tempC,
      feelsLikeC: viewModel.weather.feelsLikeC,
      humidity: viewModel.weather.humidity,
      desc: viewModel.weather.desc,
      windKmph: viewModel.weather.windKmph,
      precipMm: viewModel.weather.precipMm,
      source: viewModel.weather.source
    }
  });
}

async function testModelConnection(config = loadModelConfig()) {
  if (!hasModelConfig(config)) {
    latestModelConnectionState = "missing";
    return {
      ok: false,
      message: "缺少 Base URL、模型 ID 或密钥。"
    };
  }

  try {
    const response = await fetch("/api/model/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        modelId: config.modelId,
        apiKey: config.apiKey
      })
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      latestModelConnectionState = "failed";
      return {
        ok: false,
        message: payload?.error || payload?.message || `连接失败（HTTP ${response.status}）`
      };
    }

    latestModelConnectionState = "success";
    return {
      ok: true,
      message: "连接成功"
    };
  } catch {
    latestModelConnectionState = "failed";
    return {
      ok: false,
      message: "连接失败"
    };
  }
}

async function analyzeWithConfiguredModel(viewModel) {
  const config = loadModelConfig();
  if (!hasModelConfig(config)) {
    return limitInsightText(viewModel.insight);
  }

  const cacheKey = buildModelInsightCacheKey(viewModel, config);

  if (modelInsightCache[cacheKey]) {
    return modelInsightCache[cacheKey];
  }

  if (modelInsightPendingCache[cacheKey]) {
    return modelInsightPendingCache[cacheKey];
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

  const request = (async () => {
    try {
      const response = await fetch("/api/model/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          modelId: config.modelId,
          apiKey: config.apiKey,
          viewModel
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      const parsed = payload.insight;
      const insight = limitInsightText({
        level: parsed.level || viewModel.insight.level,
        current: parsed.current || "模型未返回当前需求。",
        incremental: parsed.incremental || "模型未返回增量机会。",
        rising: parsed.rising || "模型未返回即将起量。",
        declining: parsed.declining || "模型未返回市场下行。"
      });
      modelInsightCache[cacheKey] = insight;
      persistModelInsightCache();
      return insight;
    } catch {
      const failedInsight = limitInsightText({
        level: viewModel.insight.level,
        current: "大模型分析失败，请检查 Base URL、模型 ID、密钥或跨域设置。",
        incremental: "当前未使用内置文案回退，修复模型配置后可恢复分析。",
        rising: "如需继续查看分析结果，请先确保大模型接口可以正常返回 JSON。",
        declining: "当前未返回市场下行判断，请先修复大模型配置。"
      });
      modelInsightCache[cacheKey] = failedInsight;
      persistModelInsightCache();
      return failedInsight;
    } finally {
      delete modelInsightPendingCache[cacheKey];
    }
  })();

  modelInsightPendingCache[cacheKey] = request;
  return request;
}

async function getTimeSeries(stateKey, force = false) {
  if (!force && timeSeriesCache[stateKey]) {
    return timeSeriesCache[stateKey];
  }

  const response = await fetch(`/api/timeseries?state=${encodeURIComponent(stateKey)}${force ? "&force=1" : ""}`);
  if (!response.ok) {
    throw new Error(`Failed to load chart data: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "Failed to load chart data");
  }

  timeSeriesCache[stateKey] = payload;
  return payload;
}

function createPersonas() {
  personaGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  getPersonaOptions().forEach((persona) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `persona-chip${persona.key.startsWith("custom_user_defined") ? " custom" : ""}`;
    button.dataset.persona = persona.key;
    button.innerHTML = `<strong>${persona.label}</strong><span>${persona.description}</span>`;
    button.addEventListener("click", () => {
      appState.activePersona = persona.key;
      syncView();
    });

    if (persona.key.startsWith("custom_user_defined")) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "persona-delete";
      deleteButton.setAttribute("aria-label", `删除${persona.label}`);
      deleteButton.textContent = "×";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteCustomPersona(persona.key);
      });
      button.appendChild(deleteButton);
    }

    fragment.appendChild(button);
  });

  personaGrid.appendChild(fragment);
}

function updateHotspotState(activeKey, activeViewModel) {
  document.querySelectorAll(".usa-state").forEach((path) => {
    path.classList.remove("tier-hot", "tier-warm", "tier-cool", "tier-down", "is-focus", "is-pending");
    const stateKey = stateKeyByMapId[path.dataset.mapId];
    const resolvedInsight = getResolvedInsight(stateKey);
    if (resolvedInsight) {
      path.classList.add(getTierClass(resolvedInsight.level));
      return;
    }
    if (hasModelConfig()) {
      path.classList.add("is-pending");
    }
    const cached = insightCache[getInsightStateKey(appState.activePersona, stateKey)];
    if (cached?.insight) {
      path.classList.add(getTierClass(cached.insight.level));
    }
  });

  const activePath = mapFrame.querySelector(`[data-map-id="${stateByKey[activeKey].mapId}"]`);
  if (activePath) {
    activePath.classList.add(getTierClass(activeViewModel.insight.level));
    activePath.classList.add("is-focus");
  }
}

function updatePersonaState() {
  document.querySelectorAll(".persona-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.persona === appState.activePersona);
  });
}

function renderModelConfigStatus(configOverride = null, preserveDraft = false) {
  const config = configOverride || loadModelConfig();
  const configured = hasModelConfig(config);
  modelConfigStatus.textContent = hasModelConfig(config)
    ? `${config.modelId}`
    : "未配置";
  modelConnectionInline.classList.remove("connection-success", "connection-failed", "connection-unknown");
  modelConnectionInline.classList.add(
    latestModelConnectionState === "success"
      ? "connection-success"
      : latestModelConnectionState === "failed"
        ? "connection-failed"
        : "connection-unknown"
  );
  modelConnectionStatus.textContent = latestModelConnectionState === "success"
    ? "成功"
    : latestModelConnectionState === "failed"
      ? "失败"
      : latestModelConnectionState === "missing"
        ? "未配置完整"
        : "未检测";
  if (!preserveDraft) {
    modelConfigForm.baseUrl.value = config.baseUrl || "";
    modelConfigForm.modelId.value = config.modelId || "";
    modelConfigForm.apiKey.value = config.apiKey || "";
  }
  modelTestFeedback.textContent = latestModelConnectionState === "success"
    ? "连接成功"
    : latestModelConnectionState === "failed"
      ? "连接失败"
      : latestModelConnectionState === "missing"
        ? "缺少 Base URL、模型 ID 或密钥。"
        : "未检测连接状态";
  modelReminder.classList.toggle("hidden", configured);
}

function formatDataTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function renderDataTimeNote() {
  dataTimeNote.textContent = `数据时间：${formatDataTimestamp()}。最新数据请刷新数据。`;
}

function showAnalysisOverlay() {
  analysisOverlayDepth += 1;
  analysisOverlay.classList.remove("hidden");
  analysisOverlay.setAttribute("aria-hidden", "false");
}

function setAnalysisOverlayProgress(completed, total) {
  const stateLabel = activeAnalysisStateName ? ` ${activeAnalysisStateName}` : "";
  analysisOverlayText.textContent = `正在分析${stateLabel} ${completed} / ${total}`;
}

function countResolvedInsightsForPersona(personaKey = appState.activePersona) {
  return states.reduce((count, state) => {
    return count + (getResolvedInsight(state.key, personaKey) ? 1 : 0);
  }, 0);
}

function hideAnalysisOverlay() {
  analysisOverlayDepth = Math.max(analysisOverlayDepth - 1, 0);
  if (analysisOverlayDepth === 0) {
    activeAnalysisStateName = "";
    analysisOverlay.classList.add("hidden");
    analysisOverlay.setAttribute("aria-hidden", "true");
  }
}

async function resolveInsightForViewModel(viewModel) {
  const insight = hasModelConfig()
    ? await analyzeWithConfiguredModel(viewModel)
    : limitInsightText(viewModel.insight);
  setResolvedInsight(viewModel.state.key, viewModel.persona.key, insight);
  return insight;
}

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  const poolSize = Math.min(concurrency, items.length);
  const workers = Array.from({ length: poolSize }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

async function warmMapInsights(runId, { overlayVisible = false, totalStates = states.length } = {}) {
  const personaKey = appState.activePersona;
  let overlayShown = overlayVisible;
  const pendingStates = states.filter((state) => !getResolvedInsight(state.key, personaKey));

  await runWithConcurrency(pendingStates, 10, async (state) => {
    if (runId !== syncRunId) {
      return;
    }

    const baseViewModel = await getCachedInsight(state.key, personaKey);
    if (runId !== syncRunId) {
      return;
    }

    const needsRemoteModelAnalysis = hasModelConfig()
      && !modelInsightCache[buildModelInsightCacheKey(baseViewModel)];
    if (needsRemoteModelAnalysis && !overlayShown) {
      showAnalysisOverlay();
      overlayShown = true;
    }
    if (overlayShown) {
      activeAnalysisStateName = baseViewModel.state.name;
      setAnalysisOverlayProgress(countResolvedInsightsForPersona(personaKey), totalStates);
    }

    const insight = await resolveInsightForViewModel(baseViewModel);
    if (runId !== syncRunId) {
      return;
    }

    if (overlayShown) {
      activeAnalysisStateName = baseViewModel.state.name;
      setAnalysisOverlayProgress(countResolvedInsightsForPersona(personaKey), totalStates);
    }

    updateHotspotState(appState.activeState, {
      ...baseViewModel,
      insight: state.key === appState.activeState
        ? getResolvedInsight(appState.activeState, personaKey) || insight
        : insight
    });
  });

  return overlayShown;
}

function handleStateSelection(stateKey) {
  if (stateKey === appState.activeState) {
    return;
  }

  if (!hasModelConfig() || isStateResolved(stateKey)) {
    appState.activeState = stateKey;
    syncView();
    return;
  }

  activeAnalysisStateName = stateByKey[stateKey]?.name || "";
  if (analysisOverlayDepth === 0) {
    showAnalysisOverlay();
  }
  setAnalysisOverlayProgress(countResolvedInsightsForPersona(appState.activePersona), states.length);
}

function openModelModal() {
  modelConfigModal.classList.remove("hidden");
  modelConfigModal.setAttribute("aria-hidden", "false");
}

function closeModelModal() {
  modelConfigModal.classList.add("hidden");
  modelConfigModal.setAttribute("aria-hidden", "true");
}

function bindModelConfig() {
  openModelConfig.addEventListener("click", openModelModal);
  closeModelConfig.addEventListener("click", closeModelModal);
  modelConfigModal.addEventListener("click", (event) => {
    if (event.target === modelConfigModal) {
      closeModelModal();
    }
  });
  modelConfigForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveModelConfig({
      baseUrl: modelConfigForm.baseUrl.value.trim(),
      modelId: modelConfigForm.modelId.value.trim(),
      apiKey: modelConfigForm.apiKey.value.trim()
    });
    clearResolvedInsightCache();
    renderModelConfigStatus();
    closeModelModal();
    syncView();
  });
  testModelConfig.addEventListener("click", async () => {
    const draftConfig = getDraftModelConfig();
    testModelConfig.disabled = true;
    modelTestFeedback.textContent = "测试中...";
    const result = await testModelConnection(draftConfig);
    modelTestFeedback.textContent = result.message;
    renderModelConfigStatus(draftConfig, true);
    testModelConfig.disabled = false;
  });
  clearModelConfig.addEventListener("click", () => {
    removeStorage(storageKeys.modelConfig);
    clearResolvedInsightCache();
    latestModelConnectionState = "unknown";
    renderModelConfigStatus();
    syncView();
  });
}

function bindCustomPersonaForm() {
  customPersonaForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const label = customPersonaLabelInput.value.trim();
    const description = customPersonaDescriptionInput.value.trim();
    if (!label) {
      customPersonaLabelInput.focus();
      return;
    }

    const persona = buildCustomPersonaRecord(label, description);
    customPersonas = [...customPersonas, persona];
    saveCustomPersonas(customPersonas);
    customPersonaLabelInput.value = "";
    customPersonaDescriptionInput.value = "";
    createPersonas();
    appState.activePersona = persona.key;
    syncView();
  });
}

function clearInsightCache(prefix = "") {
  Object.keys(insightCache)
    .filter((key) => !prefix || key.startsWith(prefix))
    .forEach((key) => {
      delete insightCache[key];
    });
}

function clearWeatherCache() {
  Object.keys(weatherCache).forEach((key) => {
    delete weatherCache[key];
  });
}

function deleteCustomPersona(personaKey) {
  customPersonas = customPersonas.filter((persona) => persona.key !== personaKey);
  saveCustomPersonas(customPersonas);
  clearInsightCache(`${personaKey}:`);
  clearResolvedInsightCache(`${personaKey}:`);
  if (appState.activePersona === personaKey) {
    appState.activePersona = personas[0].key;
  }
  createPersonas();
  syncView();
}

function bindRefreshWeather() {
  refreshWeatherButton.addEventListener("click", async () => {
    refreshWeatherButton.disabled = true;
    refreshWeatherButton.textContent = "刷新中...";
    if (hasModelConfig()) {
      await testModelConnection();
      renderModelConfigStatus();
    }
    clearWeatherCache();
    clearInsightCache();
    clearResolvedInsightCache();
    clearModelAnalysisCache();
    delete timeSeriesCache[appState.activeState];
    await syncView({ forceWeather: true, forceTimeSeries: true });
    refreshWeatherButton.disabled = false;
    refreshWeatherButton.textContent = "刷新数据";
  });
}

function renderDetails(viewModel) {
  const { state, persona, weather, insight, meters } = viewModel;

  activeStateLabel.textContent = state.query;
  detailTitle.textContent = `${state.name} · ${persona.label}`;
  sourceStatus.textContent = weather.source === "live" ? "wttr.in 实时" : "兜底数据";
  signalLevel.textContent = tierLabel(insight.level);
  weatherBadge.textContent = weather.source === "live" ? "实时天气已连接" : "wttr.in 异常，已兜底";
  spotlightTitle.textContent = `${state.name} 市场窗口`;
  intensityBar.style.width = `${meters.intensity}%`;
  velocityBar.style.width = `${meters.velocity}%`;
  tempValue.textContent = `${weather.tempC}°C`;
  feelsValue.textContent = `${weather.feelsLikeC}°C`;
  conditionValue.textContent = weather.desc;
  currentDemand.textContent = insight.current;
  incrementalDemand.textContent = insight.incremental;
  risingDemand.textContent = insight.rising;
  decliningDemand.textContent = insight.declining;
  renderDataTimeNote();
}

function getWeatherLabel(code) {
  return weatherCodeLabels[code] || `WMO ${code}`;
}

function formatMetricValue(value, unit) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${value}${unit}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${value}%`;
}

function formatTooltipHtml(row, rangeKey) {
  const baseRows = [
    ["温度", `${formatMetricValue(row.temperature, "°C")}`],
    ["体感温度", `${formatMetricValue(row.apparentTemperature, "°C")}`],
    ["湿度", `${formatMetricValue(row.humidity, "%")}`],
    ["天气", `${getWeatherLabel(row.weatherCode)}`]
  ].map(([label, value]) => {
    return `<div class="chart-tooltip-row"><span>${label}</span><strong>${value}</strong></div>`;
  }).join("");

  let compareSection = "";
  if (rangeKey === "compare7y" && row.comparisons) {
    const compareRows = [
      ["温度同比", `${formatPercent(row.comparisons.temperatureYoY)} / ${formatMetricValue(row.comparisons.temperatureYoYValue, "°C")}`],
      ["温度环比", `${formatPercent(row.comparisons.temperatureMoM)} / ${formatMetricValue(row.comparisons.temperatureMoMValue, "°C")}`],
      ["体感同比", `${formatPercent(row.comparisons.apparentTemperatureYoY)} / ${formatMetricValue(row.comparisons.apparentTemperatureYoYValue, "°C")}`],
      ["体感环比", `${formatPercent(row.comparisons.apparentTemperatureMoM)} / ${formatMetricValue(row.comparisons.apparentTemperatureMoMValue, "°C")}`],
      ["湿度同比", `${formatPercent(row.comparisons.humidityYoY)} / ${formatMetricValue(row.comparisons.humidityYoYValue, "%")}`],
      ["湿度环比", `${formatPercent(row.comparisons.humidityMoM)} / ${formatMetricValue(row.comparisons.humidityMoMValue, "%")}`]
    ].map(([label, value]) => {
      return `<div class="chart-tooltip-row"><span>${label}</span><strong>${value}</strong></div>`;
    }).join("");

    compareSection = `
      <div class="chart-tooltip-section">
        <p class="chart-tooltip-section-title">同比 / 环比</p>
        <div class="chart-tooltip-list">${compareRows}</div>
      </div>
    `;
  }

  return `
    <p class="chart-tooltip-time">${row.time}</p>
    <div class="chart-tooltip-list">${baseRows}</div>
    ${compareSection}
  `;
}

function ensureChartTooltip(container) {
  let tooltip = container.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    container.appendChild(tooltip);
  }
  return tooltip;
}

function showChartTooltip(container, tooltip, row, rangeKey, clientX, clientY) {
  tooltip.innerHTML = formatTooltipHtml(row, rangeKey);
  tooltip.classList.toggle("chart-tooltip-compare", rangeKey === "compare7y");
  tooltip.classList.add("visible");

  const rect = container.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 8;
  let left = clientX - rect.left + 12;
  let top = clientY - rect.top - tooltipRect.height - 12;

  if (left + tooltipRect.width > rect.width - margin) {
    left = clientX - rect.left - tooltipRect.width - 12;
  }
  if (left < margin) {
    left = margin;
  }
  if (top < margin) {
    top = clientY - rect.top + 12;
  }
  if (top + tooltipRect.height > rect.height - margin) {
    top = rect.height - tooltipRect.height - margin;
  }
  if (top < margin) {
    top = margin;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideChartTooltip(tooltip) {
  tooltip.classList.remove("visible");
}

function getScaleBounds(values, paddingRatio = 0.12) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  if (min === max) {
    return { min: min - 1, max: max + 1 };
  }

  const padding = (max - min) * paddingRatio;
  return { min: Number((min - padding).toFixed(2)), max: Number((max + padding).toFixed(2)) };
}

function scaleValue(value, bounds, height, padding) {
  const chartHeight = height - padding.top - padding.bottom;
  const ratio = (value - bounds.min) / (bounds.max - bounds.min);
  return padding.top + chartHeight - chartHeight * ratio;
}

function buildPath(rows, key, bounds, width, height, padding) {
  const chartWidth = width - padding.left - padding.right;

  return rows.map((row, index) => {
    const x = padding.left + (chartWidth / Math.max(rows.length - 1, 1)) * index;
    const y = scaleValue(row[key], bounds, height, padding);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function labelForRange(rangeKey, value, index, total) {
  if (rangeKey === "day") {
    return value.slice(11, 16);
  }
  if (rangeKey === "compare7y") {
    return value;
  }
  if (rangeKey === "years") {
    return index % 3 === 0 || index === total - 1 ? value : "";
  }
  return value.slice(5);
}

function renderChart(rangeKey, rows) {
  const container = chartContainers[rangeKey];
  if (!rows?.length) {
    container.innerHTML = '<div class="chart-empty">暂无数据</div>';
    return;
  }

  const width = 760;
  const height = 324;
  const padding = { top: 20, right: 44, bottom: 42, left: 44 };
  const xLabels = rows.map((row, index) => labelForRange(rangeKey, row.time, index, rows.length));
  const tooltip = ensureChartTooltip(container);
  const tempBounds = getScaleBounds(rows.flatMap((row) => [row.temperature, row.apparentTemperature]));
  const humidityBounds = getScaleBounds(rows.map((row) => row.humidity), 0.08);

  const lineSpecs = [
    { key: "temperature", bounds: tempBounds, className: "line-temp" },
    { key: "apparentTemperature", bounds: tempBounds, className: "line-feels" },
    { key: "humidity", bounds: humidityBounds, className: "line-humidity" }
  ];

  const lines = lineSpecs.map((series) => {
    const d = buildPath(rows, series.key, series.bounds, width, height, padding);
    return `<path d="${d}" fill="none" stroke-width="3" class="${series.className}" stroke-linecap="round" stroke-linejoin="round"></path>`;
  }).join("");

  const chartWidth = width - padding.left - padding.right;
  const showPointLabels = rows.length <= 7;
  const pointGroups = rows.map((row, index) => {
    const x = padding.left + (chartWidth / Math.max(rows.length - 1, 1)) * index;
    const points = [
      { key: "temperature", className: "line-temp", value: row.temperature, y: scaleValue(row.temperature, tempBounds, height, padding) },
      { key: "apparentTemperature", className: "line-feels", value: row.apparentTemperature, y: scaleValue(row.apparentTemperature, tempBounds, height, padding) },
      { key: "humidity", className: "line-humidity", value: row.humidity, y: scaleValue(row.humidity, humidityBounds, height, padding) }
    ].map((point) => {
      const suffix = point.key === "humidity" ? "%" : "°";
      const label = showPointLabels
        ? `<text x="${x}" y="${point.y - 10}" text-anchor="middle" class="chart-point-label ${point.className}">${Math.round(point.value)}${suffix}</text>`
        : "";
      return `
        <circle cx="${x}" cy="${point.y}" r="5.5" class="chart-point ${point.className}" fill="currentColor"></circle>
        ${label}
      `;
    }).join("");

    return `
      <g class="chart-hover-group" data-index="${index}">
        <line x1="${x}" x2="${x}" y1="${padding.top}" y2="${height - padding.bottom}" class="chart-hover-line"></line>
        <rect x="${x - Math.max(chartWidth / Math.max(rows.length - 1, 1), 12) / 2}" y="${padding.top}" width="${Math.max(chartWidth / Math.max(rows.length - 1, 1), 12)}" height="${height - padding.top - padding.bottom}" class="chart-hit"></rect>
        ${points}
      </g>
    `;
  }).join("");

  const leftTicks = Array.from({ length: 5 }, (_, index) => {
    const value = tempBounds.min + ((tempBounds.max - tempBounds.min) / 4) * index;
    const y = scaleValue(value, tempBounds, height, padding);
    return `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="chart-axis">${value.toFixed(0)}°</text>`;
  }).join("");

  const rightTicks = Array.from({ length: 5 }, (_, index) => {
    const value = humidityBounds.min + ((humidityBounds.max - humidityBounds.min) / 4) * index;
    const y = scaleValue(value, humidityBounds, height, padding);
    return `<text x="${width - padding.right + 8}" y="${y + 4}" text-anchor="start" class="chart-axis">${value.toFixed(0)}%</text>`;
  }).join("");

  const axes = xLabels.map((label, index) => {
    if (!label) {
      return "";
    }
    const x = padding.left + (chartWidth / Math.max(rows.length - 1, 1)) * index;
    return `<text x="${x}" y="${height - 14}" text-anchor="middle" class="chart-axis">${label}</text>`;
  }).join("");

  const legend = seriesMeta.map((series) => {
    return `<span class="legend-key"><i style="background:${series.color}"></i>${series.label}</span>`;
  }).join("");

  container.innerHTML = `
    <div class="chart-layout">
      <div class="chart-plot">
        <svg
          width="${width}"
          height="${height}"
          viewBox="0 0 ${width} ${height}"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <text x="${padding.left}" y="14" text-anchor="start" class="chart-axis">温度 / 体感温度</text>
          <text x="${width - padding.right}" y="14" text-anchor="end" class="chart-axis">湿度</text>
          ${lines}
          ${leftTicks}
          ${rightTicks}
          ${pointGroups}
          ${axes}
        </svg>
      </div>
      <div class="chart-legend chart-legend-bottom">${legend}</div>
    </div>
  `;

  container.appendChild(tooltip);
  container.querySelectorAll(".chart-hover-group").forEach((group) => {
    const row = rows[Number(group.dataset.index)];
    group.addEventListener("mousemove", (event) => {
      showChartTooltip(container, tooltip, row, rangeKey, event.clientX, event.clientY);
    });
    group.addEventListener("mouseenter", (event) => {
      showChartTooltip(container, tooltip, row, rangeKey, event.clientX, event.clientY);
    });
    group.addEventListener("mouseleave", () => {
      hideChartTooltip(tooltip);
    });
  });
}

function renderAllCharts(payload) {
  activeTimeSeries = payload;
  renderChart("day", payload.ranges.day);
  renderChart("week", payload.ranges.week);
  renderChart("month", payload.ranges.month);
  renderChart("compare7y", payload.ranges.compare7y);
  renderChart("years", payload.ranges.years);
}

function toCsv(rows) {
  const headers = ["time", "temperature", "apparentTemperature", "humidity", "weatherCode"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => row[header]).join(","))
  ].join("\n");
}

function bindChartDownloads() {
  document.querySelectorAll(".chart-download").forEach((button) => {
    button.addEventListener("click", () => {
      if (!activeTimeSeries) {
        return;
      }

      const rangeKey = button.dataset.range;
      const rows = activeTimeSeries.ranges[rangeKey] || [];
      const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `${activeTimeSeries.state.key}-${rangeKey}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  });
}

async function syncView({ forceWeather = false, forceTimeSeries = false } = {}) {
  const runId = ++syncRunId;
  const totalStates = states.length;
  updatePersonaState();
  if (forceWeather) {
    delete weatherCache[appState.activeState];
  }
  const baseViewModel = await getCachedInsight(appState.activeState, appState.activePersona);
  if (runId !== syncRunId) {
    return;
  }

  let overlayShown = false;
  const needsRemoteModelAnalysis = hasModelConfig()
    && !getResolvedInsight(appState.activeState, appState.activePersona)
    && !modelInsightCache[buildModelInsightCacheKey(baseViewModel)];
  if (needsRemoteModelAnalysis) {
    showAnalysisOverlay();
    overlayShown = true;
    activeAnalysisStateName = baseViewModel.state.name;
    setAnalysisOverlayProgress(countResolvedInsightsForPersona(appState.activePersona), totalStates);
  }

  const activeViewModel = {
    ...baseViewModel,
    insight: await resolveInsightForViewModel(baseViewModel)
  };
  if (overlayShown) {
    setAnalysisOverlayProgress(countResolvedInsightsForPersona(appState.activePersona), totalStates);
  }
  if (runId !== syncRunId) {
    return;
  }
  updateHotspotState(appState.activeState, activeViewModel);
  renderDetails(activeViewModel);
  const timeSeries = await getTimeSeries(appState.activeState, forceTimeSeries);
  if (runId !== syncRunId) {
    return;
  }
  renderAllCharts(timeSeries);
  try {
    overlayShown = await warmMapInsights(runId, { overlayVisible: overlayShown, totalStates });
  } finally {
    if (overlayShown) {
      hideAnalysisOverlay();
    }
  }
}

loadPersistedModelInsightCache();
renderUsMap();
createPersonas();
renderDecisionOutputSummary();
renderModelConfigStatus();
renderDataTimeNote();
bindModelConfig();
bindCustomPersonaForm();
bindRefreshWeather();
bindChartDownloads();
syncView();
