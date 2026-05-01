/* =============================================
   ATMOS — app.js
   Open-Meteo + Geocoding API (no key needed)
   ============================================= */

'use strict';

// ── API endpoints ───────────────────────────────────────────
const GEO_API   = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_API    = 'https://api.open-meteo.com/v1/forecast';

// ── WMO weather code map ────────────────────────────────────
const WMO = {
  0:  { label: 'Clear Sky',          icon: '☀️' },
  1:  { label: 'Mainly Clear',       icon: '🌤️' },
  2:  { label: 'Partly Cloudy',      icon: '⛅' },
  3:  { label: 'Overcast',           icon: '☁️' },
  45: { label: 'Foggy',              icon: '🌫️' },
  48: { label: 'Icy Fog',            icon: '🌫️' },
  51: { label: 'Light Drizzle',      icon: '🌦️' },
  53: { label: 'Drizzle',            icon: '🌦️' },
  55: { label: 'Heavy Drizzle',      icon: '🌧️' },
  61: { label: 'Light Rain',         icon: '🌧️' },
  63: { label: 'Rain',               icon: '🌧️' },
  65: { label: 'Heavy Rain',         icon: '🌧️' },
  66: { label: 'Freezing Rain',      icon: '🌨️' },
  67: { label: 'Heavy Freezing Rain',icon: '🌨️' },
  71: { label: 'Light Snow',         icon: '❄️' },
  73: { label: 'Snow',               icon: '🌨️' },
  75: { label: 'Heavy Snow',         icon: '🌨️' },
  77: { label: 'Snow Grains',        icon: '🌨️' },
  80: { label: 'Light Showers',      icon: '🌦️' },
  81: { label: 'Showers',            icon: '🌧️' },
  82: { label: 'Heavy Showers',      icon: '⛈️' },
  85: { label: 'Snow Showers',       icon: '🌨️' },
  86: { label: 'Heavy Snow Showers', icon: '🌨️' },
  95: { label: 'Thunderstorm',       icon: '⛈️' },
  96: { label: 'Thunderstorm+Hail',  icon: '⛈️' },
  99: { label: 'Violent Thunderstorm',icon: '🌩️' },
};

function getWMO(code) {
  return WMO[code] || { label: 'Unknown', icon: '❓' };
}

// UV label
function uvLabel(uv) {
  if (uv <= 2)  return 'LOW';
  if (uv <= 5)  return 'MODERATE';
  if (uv <= 7)  return 'HIGH';
  if (uv <= 10) return 'VERY HIGH';
  return 'EXTREME';
}

// Wind direction arrow from degrees
function windArrow(deg) {
  const dirs = ['↑','↗','→','↘','↓','↙','←','↖'];
  return dirs[Math.round(deg / 45) % 8];
}

// Format time from ISO string
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Format hour label
function fmtHour(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  if (h === 0) return '12 AM';
  if (h < 12)  return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// Format day label
function fmtDay(dateStr, idx) {
  if (idx === 0) return 'TODAY';
  if (idx === 1) return 'TOMORROW';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
}

// ── DOM references ──────────────────────────────────────────
const searchInput  = document.getElementById('searchInput');
const suggestions  = document.getElementById('suggestions');
const locateBtn    = document.getElementById('locateBtn');
const loadingState = document.getElementById('loadingState');
const errorState   = document.getElementById('errorState');
const errorMsg     = document.getElementById('errorMsg');
const retryBtn     = document.getElementById('retryBtn');
const emptyState   = document.getElementById('emptyState');
const dashboard    = document.getElementById('dashboard');

// ── State ───────────────────────────────────────────────────
let lastLatLon = null;
let searchTimeout = null;

// ── UI helpers ──────────────────────────────────────────────
function showLoading() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  emptyState.classList.add('hidden');
  dashboard.classList.add('hidden');
}

function showError(msg) {
  loadingState.classList.add('hidden');
  errorState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  dashboard.classList.add('hidden');
  errorMsg.textContent = msg;
}

function showDashboard() {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  emptyState.classList.add('hidden');
  dashboard.classList.remove('hidden');
}

function showEmpty() {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  emptyState.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

// Animate a bar fill
function animateBar(el, pct) {
  setTimeout(() => { el.style.width = Math.min(100, pct) + '%'; }, 50);
}

// ── Geocoding ───────────────────────────────────────────────
async function geocodeQuery(query) {
  const url = `${GEO_API}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  return data.results || [];
}

// ── Weather fetch ────────────────────────────────────────────
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude:  lat,
    longitude: lon,
    current: [
      'temperature_2m','apparent_temperature','relative_humidity_2m',
      'wind_speed_10m','wind_direction_10m','uv_index',
      'weathercode','precipitation_probability'
    ].join(','),
    hourly: [
      'temperature_2m','weathercode','precipitation_probability'
    ].join(','),
    daily: [
      'temperature_2m_max','temperature_2m_min','weathercode',
      'sunrise','sunset','precipitation_probability_max'
    ].join(','),
    timezone: 'auto',
    forecast_days: 7,
    forecast_hours: 25,
  });

  const res  = await fetch(`${WX_API}?${params}`);
  if (!res.ok) throw new Error('Weather API error');
  return res.json();
}

// ── Render dashboard ─────────────────────────────────────────
function renderWeather(data, cityName, country) {
  const c  = data.current;
  const h  = data.hourly;
  const d  = data.daily;
  const tz = data.timezone;
  const wmo = getWMO(c.weathercode);

  // Hero
  document.getElementById('cityName').textContent    = cityName;
  document.getElementById('countryName').textContent = country || tz;
  document.getElementById('updateTime').textContent  =
    'UPDATED ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  document.getElementById('weatherIcon').textContent    = wmo.icon;
  document.getElementById('conditionLabel').textContent = wmo.label.toUpperCase();
  document.getElementById('tempValue').textContent      = Math.round(c.temperature_2m);
  document.getElementById('feelsLike').textContent      = Math.round(c.apparent_temperature);

  // Stats
  const hum = c.relative_humidity_2m;
  document.getElementById('humidity').textContent = hum;
  animateBar(document.getElementById('humidityBar'), hum);

  document.getElementById('windSpeed').textContent = Math.round(c.wind_speed_10m);
  document.getElementById('windDir').textContent   = windArrow(c.wind_direction_10m || 0);
  document.getElementById('windDir').style.transform = `rotate(${c.wind_direction_10m || 0}deg)`;

  const uv = c.uv_index;
  document.getElementById('uvIndex').textContent = uv ?? '—';
  document.getElementById('uvLabel').textContent = uv != null ? uvLabel(uv) : '';
  animateBar(document.getElementById('uvBar'), uv != null ? (uv / 12) * 100 : 0);

  const pp = c.precipitation_probability ?? 0;
  document.getElementById('precipProb').textContent = pp;
  animateBar(document.getElementById('precipBar'), pp);

  document.getElementById('sunrise').textContent = fmtTime(d.sunrise[0]);
  document.getElementById('sunset').textContent  = fmtTime(d.sunset[0]);

  // Bg glow color based on condition
  const bgGlow = document.getElementById('bgGlow');
  if (c.weathercode === 0 || c.weathercode === 1) {
    bgGlow.style.background = 'radial-gradient(circle, rgba(255,180,60,0.05) 0%, transparent 70%)';
  } else if (c.weathercode >= 61 && c.weathercode <= 82) {
    bgGlow.style.background = 'radial-gradient(circle, rgba(123,97,255,0.06) 0%, transparent 70%)';
  } else {
    bgGlow.style.background = 'radial-gradient(circle, rgba(74,234,220,0.04) 0%, transparent 70%)';
  }

  // Hourly forecast (next 24 slots)
  const hourlyScroll = document.getElementById('hourlyScroll');
  hourlyScroll.innerHTML = '';
  const now = new Date();
  const currentHourISO = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:00`;

  let shown = 0;
  for (let i = 0; i < h.time.length && shown < 25; i++) {
    const timeStr = h.time[i];
    if (timeStr < currentHourISO.slice(0, 13)) continue;
    const isCurrent = timeStr.slice(0, 13) === currentHourISO.slice(0, 13);
    const card = document.createElement('div');
    card.className = 'hour-card' + (isCurrent ? ' current-hour' : '');
    card.innerHTML = `
      <span class="hour-time">${isCurrent ? 'NOW' : fmtHour(timeStr)}</span>
      <span class="hour-icon">${getWMO(h.weathercode[i]).icon}</span>
      <span class="hour-temp">${Math.round(h.temperature_2m[i])}°</span>
      <span class="hour-rain">${h.precipitation_probability[i] ?? 0}%</span>
    `;
    hourlyScroll.appendChild(card);
    shown++;
  }

  // 7-day forecast
  const dailyGrid = document.getElementById('dailyGrid');
  dailyGrid.innerHTML = '';
  const allTemps = [...d.temperature_2m_max, ...d.temperature_2m_min];
  const globalMin = Math.min(...allTemps);
  const globalMax = Math.max(...allTemps);
  const range = globalMax - globalMin || 1;

  for (let i = 0; i < d.time.length; i++) {
    const lo  = Math.round(d.temperature_2m_min[i]);
    const hi  = Math.round(d.temperature_2m_max[i]);
    const barW = ((hi - globalMin) / range) * 100;

    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <span class="day-name">${fmtDay(d.time[i], i)}</span>
      <span class="day-icon">${getWMO(d.weathercode[i]).icon}</span>
      <div class="day-bar-container">
        <div class="day-bar-track">
          <div class="day-bar-fill" style="width:${barW}%"></div>
        </div>
      </div>
      <span class="day-low">${lo}°</span>
      <span class="day-high">${hi}°</span>
    `;
    dailyGrid.appendChild(row);
  }

  showDashboard();
}

// ── Main load flow ───────────────────────────────────────────
async function loadWeather(lat, lon, city, country) {
  showLoading();
  lastLatLon = { lat, lon, city, country };
  try {
    const data = await fetchWeather(lat, lon);
    renderWeather(data, city, country);
  } catch (err) {
    showError('Failed to load weather data. Check your connection.');
    console.error(err);
  }
}

// ── Search ───────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (q.length < 2) { suggestions.innerHTML = ''; return; }
  searchTimeout = setTimeout(async () => {
    try {
      const results = await geocodeQuery(q);
      renderSuggestions(results);
    } catch (_) {
      suggestions.innerHTML = '';
    }
  }, 350);
});

function renderSuggestions(results) {
  suggestions.innerHTML = '';
  if (!results.length) return;
  results.slice(0, 5).forEach(r => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.innerHTML = `
      <span class="sugg-pin">◎</span>
      <span>${r.name}${r.admin1 ? ', ' + r.admin1 : ''}</span>
      <span class="sugg-country">${r.country_code || ''}</span>
    `;
    li.addEventListener('click', () => {
      searchInput.value = r.name;
      suggestions.innerHTML = '';
      loadWeather(r.latitude, r.longitude, r.name, r.country);
    });
    suggestions.appendChild(li);
  });
}

// Close suggestions on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) suggestions.innerHTML = '';
});

// Enter key — pick first suggestion or search directly
searchInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const q = searchInput.value.trim();
  if (!q) return;
  suggestions.innerHTML = '';
  showLoading();
  try {
    const results = await geocodeQuery(q);
    if (!results.length) { showError(`No results found for "${q}"`); return; }
    const r = results[0];
    searchInput.value = r.name;
    loadWeather(r.latitude, r.longitude, r.name, r.country);
  } catch (_) {
    showError('Geocoding failed. Try again.');
  }
});

// ── Geolocation ──────────────────────────────────────────────
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation not supported in this browser.');
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      // Reverse geocode via Open-Meteo geocoding isn't available,
      // so we use a free nominatim call for the city name
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const geo  = await res.json();
        const city = geo.address?.city || geo.address?.town || geo.address?.village || 'Your Location';
        const country = geo.address?.country || '';
        loadWeather(lat, lon, city, country);
      } catch (_) {
        loadWeather(lat, lon, 'Your Location', '');
      }
    },
    (err) => {
      showError('Location access denied. Search a city instead.');
    },
    { timeout: 8000 }
  );
});

// Auto-locate on page load
async function autoLocate() {
  if (!navigator.geolocation) {
    showEmpty();
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const geo  = await res.json();
        const city = geo.address?.city || geo.address?.town || geo.address?.village || 'Your Location';
        const country = geo.address?.country || '';
        loadWeather(lat, lon, city, country);
      } catch (_) {
        loadWeather(lat, lon, 'Your Location', '');
      }
    },
    (err) => {
      // If location access denied or timeout, show empty state
      showEmpty();
    },
    { timeout: 8000 }
  );
}

// ── Retry ────────────────────────────────────────────────────
retryBtn.addEventListener('click', () => {
  if (lastLatLon) {
    const { lat, lon, city, country } = lastLatLon;
    loadWeather(lat, lon, city, country);
  } else {
    showEmpty();
  }
});

// ── Init ─────────────────────────────────────────────────────
autoLocate();