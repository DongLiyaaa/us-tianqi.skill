import usaMapData from "./usa-map-data.js";

function slugStateName(name) {
  return name.toLowerCase().replace(/[^a-z]+/g, "");
}

const stateQueryOverrides = {
  california: "Los Angeles",
  washington: "Seattle",
  texas: "Dallas",
  colorado: "Denver",
  illinois: "Chicago",
  florida: "Miami",
  newyork: "New York",
  georgia: "Atlanta",
  districtofcolumbia: "Washington DC"
};

export const states = usaMapData.locations.map((location) => {
  const key = slugStateName(location.name);
  return {
    key,
    name: location.name,
    query: stateQueryOverrides[key] || location.name,
    mapId: location.id
  };
});

export const personas = [
  { key: "cold_chain", label: "冷暖穿搭", description: "服饰、鞋靴、保暖与换季搭配" },
  { key: "outdoor", label: "户外出行", description: "露营、跑步、雨具、防晒与通勤" },
  { key: "home_climate", label: "家居气候", description: "加湿、除湿、空调、寝具与收纳" },
  { key: "vehicle", label: "汽车季节件", description: "遮阳、雨刷、胎压、应急与清洁" }
];

export const fallbackWeather = {
  california: { tempC: 27, feelsLikeC: 29, desc: "Sunny", humidity: 42, windKmph: 14, precipMm: 0 },
  washington: { tempC: 11, feelsLikeC: 9, desc: "Patchy rain nearby", humidity: 73, windKmph: 18, precipMm: 0.8 },
  texas: { tempC: 30, feelsLikeC: 33, desc: "Hot and bright", humidity: 47, windKmph: 20, precipMm: 0 },
  colorado: { tempC: 16, feelsLikeC: 14, desc: "Clear", humidity: 35, windKmph: 17, precipMm: 0 },
  illinois: { tempC: 8, feelsLikeC: 5, desc: "Windy", humidity: 61, windKmph: 25, precipMm: 0 },
  florida: { tempC: 29, feelsLikeC: 34, desc: "Humid sunshine", humidity: 79, windKmph: 16, precipMm: 0.1 },
  newyork: { tempC: 9, feelsLikeC: 6, desc: "Cloudy", humidity: 58, windKmph: 21, precipMm: 0 },
  georgia: { tempC: 24, feelsLikeC: 25, desc: "Warm breeze", humidity: 63, windKmph: 15, precipMm: 0 }
};

export const stateByKey = Object.fromEntries(states.map((state) => [state.key, state]));
export const personaByKey = Object.fromEntries(personas.map((persona) => [persona.key, persona]));

export function buildCustomPersona(label, description) {
  return {
    key: "custom_user_defined",
    label: label || "自定义场景",
    description: description || "由客户自行输入的业务场景"
  };
}

export function normalizeWeather(json) {
  const current = json.current_condition?.[0];
  if (!current) {
    return null;
  }

  return {
    tempC: Number(current.temp_C),
    feelsLikeC: Number(current.FeelsLikeC),
    desc: current.weatherDesc?.[0]?.value || "Unknown",
    humidity: Number(current.humidity),
    windKmph: Number(current.windspeedKmph),
    precipMm: Number(current.precipMM || 0)
  };
}

export function tierClass(level) {
  if (level === "current") return "tier-hot";
  if (level === "incremental") return "tier-warm";
  if (level === "declining") return "tier-down";
  return "tier-cool";
}

export function tierLabel(level) {
  if (level === "current") return "当前需求强";
  if (level === "incremental") return "增量机会";
  if (level === "declining") return "市场下行";
  return "即将起量";
}

export function tierMeter(level) {
  if (level === "current") {
    return { intensity: 88, velocity: 74 };
  }
  if (level === "incremental") {
    return { intensity: 62, velocity: 68 };
  }
  if (level === "declining") {
    return { intensity: 24, velocity: 18 };
  }
  return { intensity: 36, velocity: 83 };
}

export function scoreDemand(weather, personaKey) {
  const heat = weather.tempC >= 28 || weather.feelsLikeC >= 31;
  const chill = weather.tempC <= 10 || weather.feelsLikeC <= 7;
  const wet = weather.precipMm >= 0.4 || /rain|storm|shower/i.test(weather.desc);
  const windy = weather.windKmph >= 24;
  const humid = weather.humidity >= 75;
  const mildWindow = weather.tempC >= 16 && weather.tempC <= 24;

  if (personaKey === "cold_chain") {
    if (chill || windy) {
      return {
        level: "current",
        current: "保暖外套、卫衣、轻羽绒、长袜和防风鞋靴正在有明确转化空间，适合把主推落在御寒与叠穿上。",
        incremental: "可同步补推围巾、保温杯和室内舒适品，作为加购层提升客单。",
        rising: "一旦未来两三天回暖到 16°C 以上，薄外套和运动休闲套装会开始起量。"
      };
    }
    if (mildWindow) {
      return {
        level: "incremental",
        current: "换季单品处于稳定需求，薄卫衣、长袖 T 恤和轻量夹克更容易成交。",
        incremental: "可重点测防晒外套、透气运动鞋和轻户外穿搭，适合做中腰部拉新。",
        rising: "如果温度继续上行，夏季短袖和轻薄防晒品会接棒起量。"
      };
    }
    return {
      level: "rising",
      current: "厚重保暖款会放缓，当前更适合清理尾货和保留基础款曝光。",
      incremental: "背心、亚麻衬衫和轻量凉感服饰可以提前预热，承接升温场景。",
      rising: "高温延续后，短袖、凉感面料和防晒帽会迅速进入起量周期。"
    };
  }

  if (personaKey === "outdoor") {
    if (wet) {
      return {
        level: "current",
        current: "雨具、防水鞋套、防泼水外套和车载雨天用品是当前的直接需求，转化窗口最明确。",
        incremental: "可叠加防水收纳、便携雨披和速干毛巾，做场景化加购。",
        rising: "天气转晴后，露营和徒步类装备会从应急型购买转向计划型购买。"
      };
    }
    if (heat || humid) {
      return {
        level: "incremental",
        current: "防晒衣、遮阳帽、冰感毛巾和补水杯具正在稳定起量，适合提高曝光。",
        incremental: "便携风扇、车载遮阳与防蚊产品有明显加购空间。",
        rising: "如果高温持续，泳池、海边和露营纳凉品会进入更强爆发段。"
      };
    }
    return {
      level: "rising",
      current: "温和天气利于跑步、露营与城市通勤，基础户外用品维持稳定需求。",
      incremental: "瑜伽垫、跑步腰包和露营桌椅适合做组合测试，容易带来增量。",
      rising: "一旦周末继续放晴，轻户外和短途出行装备会明显上量。"
    };
  }

  if (personaKey === "home_climate") {
    if (humid || wet) {
      return {
        level: "current",
        current: "除湿机、除味包、防霉收纳和快干寝具是当前强需求，尤其适合潮湿州份。",
        incremental: "清洁耗材、地垫和防潮收纳盒可作为配套增购。",
        rising: "若后续温度继续升高，风扇和便携空调会接力起量。"
      };
    }
    if (heat) {
      return {
        level: "current",
        current: "风扇、凉感床品、遮光窗帘和便携制冷类产品进入明显需求区间。",
        incremental: "驱蚊、净味和冰箱收纳会随着居家避暑场景一起增量。",
        rising: "高温延续时，空调伴侣和节能配件会更容易被主动搜索。"
      };
    }
    if (chill) {
      return {
        level: "incremental",
        current: "基础保暖家居、加湿器和毛毯还有需求，但已经从峰值回落。",
        incremental: "香薰、睡眠和居家舒适类组合更适合做客单提升。",
        rising: "回暖后，春夏换季收纳、清洁和通风类产品会开始起量。"
      };
    }
    return {
      level: "rising",
      current: "居家需求偏平稳，功能型家居更多依赖陈列与组合场景驱动。",
      incremental: "换季收纳、轻清洁和空气循环类适合先投放试单。",
      rising: "下一轮明显升温或降雨时，除湿和制冷会更快放量。"
    };
  }

  if (heat || humid) {
    return {
      level: "current",
      current: "遮阳挡、车载风扇、玻璃防晒膜和轮胎气压监测正在有较强需求，适合做夏季养车主推。",
      incremental: "车载冰箱、冷感坐垫和应急电源可以承接更高客单。",
      rising: "持续热浪会带动车内降温和长途出行用品进一步起量。"
    };
  }
  if (wet || windy) {
    return {
      level: "incremental",
      current: "雨刷、玻璃驱水、应急灯和轮胎检查类用品有稳定需求。",
      incremental: "便携充气泵、拖车绳和雨天清洁养护套装适合组合放大增量。",
      rising: "如果接下来天气恶化，车险周边和道路应急装备会开始放量。"
    };
  }
  return {
    level: "rising",
    current: "汽车季节件暂时偏平稳，适合保持基础曝光，不必重压库存。",
    incremental: "春游通勤场景下，收纳、手机支架和车内清洁仍有补量空间。",
    rising: "遇到高温、暴雨或长假出行节点时，汽车应急和舒适件会明显起量。"
  };
}

export function scoreCustomDemand(weather, customPersona) {
  const heat = weather.tempC >= 28 || weather.feelsLikeC >= 31;
  const chill = weather.tempC <= 10 || weather.feelsLikeC <= 7;
  const wet = weather.precipMm >= 0.4 || /rain|storm|shower/i.test(weather.desc);
  const humid = weather.humidity >= 75;
  const subject = customPersona.label || "该自定义场景";

  if (wet) {
    return {
      level: "current",
      current: `${subject}当前更受降雨驱动，用户会优先寻找防水、防潮、应急和即时替代类产品。`,
      incremental: `可以围绕${subject}补充收纳、耗材和搭配件，承接雨天临时加购。`,
      rising: "一旦天气转晴，需求会从应急购买转向计划型采购，适合提前铺下一波主推。"
    };
  }

  if (heat || humid) {
    return {
      level: "incremental",
      current: `${subject}会受到升温影响，当前更容易出现降温、遮阳、通风和轻便型需求。`,
      incremental: `建议围绕${subject}测试舒适升级、配件加购和便携型产品，通常更容易吃到增量。`,
      rising: "如果高温继续维持，两到三天内更强的集中采购需求会开始形成。"
    };
  }

  if (chill) {
    return {
      level: "current",
      current: `${subject}当前偏向保暖、防风、室内替代和刚需补货场景，适合优先推功能型商品。`,
      incremental: `可叠加舒适型、保温型和维护型商品，帮助${subject}拉高客单。`,
      rising: "回暖后，这类需求会转向轻量版和过渡型产品，可以提前预热。"
    };
  }

  return {
    level: "rising",
    current: `${subject}目前处在相对平稳阶段，需求更多来自常规补货和场景化浏览。`,
    incremental: `现在更适合用组合包、主题陈列和细分配件去为${subject}寻找增量。`,
    rising: "一旦后续出现明显升温、降温或连续降雨，这个场景会更快进入起量区间。"
  };
}

export async function fetchWeatherForState(state, weatherCache = {}) {
  if (weatherCache[state.key]) {
    return weatherCache[state.key];
  }

  const endpoint = `https://wttr.in/${encodeURIComponent(state.query)}?format=j1`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    const normalized = normalizeWeather(json);
    if (!normalized) {
      throw new Error("Weather payload missing current condition");
    }
    weatherCache[state.key] = { ...normalized, source: "live" };
    return weatherCache[state.key];
  } catch (error) {
    const fallback = fallbackWeather[state.key] || {
      tempC: 18,
      feelsLikeC: 17,
      desc: "Clear",
      humidity: 55,
      windKmph: 12,
      precipMm: 0
    };
    weatherCache[state.key] = { ...fallback, source: "fallback" };
    return weatherCache[state.key];
  }
}

export async function getInsight(stateKey, personaKey, weatherCache = {}) {
  const state = stateByKey[stateKey];
  if (!state) {
    throw new Error(`Unknown state: ${stateKey}`);
  }

  const persona = personaByKey[personaKey];
  if (!persona) {
    throw new Error(`Unknown persona: ${personaKey}`);
  }

  const weather = await fetchWeatherForState(state, weatherCache);
  const insight = scoreDemand(weather, personaKey);
  return { state, persona, weather, insight, meters: tierMeter(insight.level) };
}

export async function getCustomInsight(stateKey, customPersona, weatherCache = {}) {
  const state = stateByKey[stateKey];
  if (!state) {
    throw new Error(`Unknown state: ${stateKey}`);
  }

  const weather = await fetchWeatherForState(state, weatherCache);
  const insight = scoreCustomDemand(weather, customPersona);
  return { state, persona: customPersona, weather, insight, meters: tierMeter(insight.level) };
}
