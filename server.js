/**
 * ══════════════════════════════════════════════════════════
 *  🌦️ Weather API Server — Pure Node.js (بدون مكتبات خارجية)
 *  يجلب أحوال الطقس من Open-Meteo API (مجاني بدون مفتاح)
 *
 *  التشغيل:  node server.js
 *  (أو مع Express: npm install && npm start — نسخة Express مذكورة بالأسفل)
 * ══════════════════════════════════════════════════════════ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// 🌍 روابط الـ APIs
const GEO_URL     = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

// 🧭 ترجمة رموز الطقس (WMO Weather Codes) من Open-Meteo
const WEATHER_CODES = {
  0:  { ar: "سماء صافية",   icon: "☀️" }, 1:  { ar: "غائم جزئياً", icon: "🌤️" },
  2:  { ar: "غائم جزئياً",   icon: "⛅" }, 3:  { ar: "غائم",       icon: "☁️" },
  45: { ar: "ضباب",         icon: "🌫️" }, 48: { ar: "ضباب متجمد",  icon: "🌫️" },
  51: { ar: "رذاذ خفيف",    icon: "🌦️" }, 53: { ar: "رذاذ معتدل",  icon: "🌦️" },
  55: { ar: "رذاذ كثيف",    icon: "🌧️" }, 61: { ar: "أمطار خفيفة", icon: "🌧️" },
  63: { ar: "أمطار معتدلة", icon: "🌧️" }, 65: { ar: "أمطار غزيرة", icon: "⛈️" },
  71: { ar: "ثلج خفيف",     icon: "🌨️" }, 73: { ar: "ثلج معتدل",   icon: "🌨️" },
  75: { ar: "ثلج كثيف",     icon: "❄️" }, 80: { ar: "زخات خفيفة",  icon: "🌦️" },
  81: { ar: "زخات معتدلة",  icon: "🌧️" }, 82: { ar: "زخات عنيفة",  icon: "⛈️" },
  95: { ar: "عاصفة رعدية",  icon: "⛈️" }
};

// ── أدوات مساعدة ──────────────────────────────
const json = (res, code, data) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
};

/** 🔎 GET /api/search?q=الرياض → البحث عن مدينة */
async function handleSearch(res, url) {
  const q = url.searchParams.get("q");
  if (!q) return json(res, 400, { error: "أدخل اسم المدينة" });

  const r = await fetch(`${GEO_URL}?name=${encodeURIComponent(q)}&count=8&language=ar&format=json`);
  const data = await r.json();

  json(res, 200, {
    results: (data.results || []).map(c => ({
      name: c.name, country: c.country || "", admin: c.admin1 || "",
      lat: c.latitude, lon: c.longitude
    }))
  });
}

/** 🌦️ GET /api/weather?lat=..&lon=.. → الطقس الحالي + التوقعات */
async function handleWeather(res, url) {
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  if (!lat || !lon) return json(res, 400, { error: "إحداثيات غير صالحة" });

  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover",
    hourly: "temperature_2m,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
    timezone: "auto", forecast_days: "7"
  });

  const r = await fetch(`${WEATHER_URL}?${params}`);
  const data = await r.json();

  const info = WEATHER_CODES[data.current.weather_code] || { ar: "غير معروف", icon: "🌡️" };

  json(res, 200, {
    current: {
      temp: Math.round(data.current.temperature_2m),
      feels: Math.round(data.current.apparent_temperature),
      humidity: data.current.relative_humidity_2m,
      wind: data.current.wind_speed_10m,
      windDir: data.current.wind_direction_10m,
      pressure: data.current.pressure_msl,
      cloud: data.current.cloud_cover,
      precip: data.current.precipitation,
      isDay: data.current.is_day === 1,
      desc: info.ar, icon: info.icon
    },
    daily: data.daily.time.map((t, i) => ({
      date: t,
      max: Math.round(data.daily.temperature_2m_max[i]),
      min: Math.round(data.daily.temperature_2m_min[i]),
      desc: (WEATHER_CODES[data.daily.weather_code[i]] || {}).ar || "",
      icon: (WEATHER_CODES[data.daily.weather_code[i]] || {}).icon || "🌡️",
      sunrise: data.daily.sunrise[i].split("T")[1],
      sunset:  data.daily.sunset[i].split("T")[1],
      rainProb: data.daily.precipitation_probability_max[i]
    })),
    hourly: data.hourly.time.slice(0, 24).map((t, i) => ({
      time: t.split("T")[1],
      temp: Math.round(data.hourly.temperature_2m[i]),
      rainProb: data.hourly.precipitation_probability[i]
    })),
    timezone: data.timezone
  });
}

/** 🎨 تقديم ملفات الواجهة الثابتة */
function serveStatic(res, pathname) {
  let file = pathname === "/" ? "index.html" : pathname.slice(1);
  file = path.join(PUBLIC_DIR, path.normalize(file));

  // حماية: منع الخروج خارج مجلد public
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "ممنوع" });

  const ext = path.extname(file);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };

  fs.readFile(file, (err, content) => {
    if (err) {
      // أي مسار آخر → الصفحة الرئيسية
      return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, html) => {
        if (e2) return json(res, 404, { error: "غير موجود" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
    }
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// ═══ إنشاء السيرفر ═══
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/search")  return await handleSearch(res, url);
    if (url.pathname === "/api/weather") return await handleWeather(res, url);
    serveStatic(res, url.pathname);
  } catch (err) {
    json(res, 500, { error: "خطأ في الخادم: " + err.message });
  }
});

server.listen(PORT, () => console.log(`🌦️  السيرفر يعمل على: http://localhost:${PORT}`));

/*
 * 💡 نسخة Express بديلة (لو تريدها):
 * const express = require("express");
 * const app = express();
 * app.use(express.static("public"));
 * app.get("/api/search",  ... نفس handleSearch  مع res.json)
 * app.get("/api/weather", ... نفس handleWeather مع res.json)
 * app.listen(3000);
 */
