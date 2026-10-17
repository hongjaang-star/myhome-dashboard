/* ========================================
   weather.js — 날씨 위젯 (Phase 3 고도화)
   - 도시 검색/변경 인라인 지원
   - 30분 캐시 (localStorage)
   - 시간별 예보 탭
   - 자외선/가시거리 추가
   - 자동 갱신 (30분)
   ======================================== */
const WeatherWidget = (() => {

  var WMO_ICONS = {
    0:'☀️',1:'🌤️',2:'⛅',3:'☁️',
    45:'🌫️',48:'🌫️',
    51:'🌦️',53:'🌦️',55:'🌧️',
    61:'🌧️',63:'🌧️',65:'🌧️',
    71:'🌨️',73:'🌨️',75:'❄️',
    77:'🌨️',80:'🌦️',81:'🌧️',82:'⛈️',
    85:'🌨️',86:'❄️',
    95:'⛈️',96:'⛈️',99:'⛈️',
  };
  var WMO_DESC = {
    0:'맑음',1:'대체로 맑음',2:'구름 조금',3:'흐림',
    45:'안개',48:'안개',
    51:'약한 이슬비',53:'이슬비',55:'강한 이슬비',
    61:'약한 비',63:'비',65:'강한 비',
    71:'약한 눈',73:'눈',75:'강한 눈',
    80:'소나기',81:'강한 소나기',82:'폭우',
    95:'뇌우',96:'우박 뇌우',99:'강한 뇌우',
  };
  var DAYS_KO   = ['일','월','화','수','목','금','토'];
  var CACHE_KEY = 'mydash_weather_cache';
  var CACHE_TTL = 30 * 60 * 1000;
  var _timers   = {};

  /* ── 렌더 ── */
  function render(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML =
      '<div class="widget weather-widget">' +
        '<div class="widget-header">' +
          '<span class="widget-title"><span class="icon">🌤️</span> 날씨</span>' +
          '<div class="widget-actions">' +
            '<button class="widget-action-btn" id="' + containerId + '_cityedit" title="도시 변경">📍</button>' +
            '<button class="widget-action-btn" id="' + containerId + '_refresh"  title="새로고침">↺</button>' +
            '<button class="widget-action-btn danger" onclick="DashGrid.removeWidget(\'' + containerId + '\')" title="삭제">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="weather-city-edit" id="' + containerId + '_citybar" style="display:none;">' +
          '<input type="text" id="' + containerId + '_cityinp" class="settings-input" placeholder="도시명 입력 (예: 서울, 부산...)" style="flex:1;">' +
          '<button class="btn btn-sm btn-primary" id="' + containerId + '_cityok">확인</button>' +
          '<button class="btn btn-sm btn-secondary" id="' + containerId + '_citycancel">취소</button>' +
        '</div>' +
        '<div class="weather-tabs" id="' + containerId + '_tabs">' +
          '<button class="weather-tab active" data-tab="current">현재</button>' +
          '<button class="weather-tab" data-tab="hourly">시간별</button>' +
          '<button class="weather-tab" data-tab="forecast">3일</button>' +
        '</div>' +
        '<div class="widget-body" id="' + containerId + '_body">' +
          '<div class="weather-loading"><div class="spinner"></div><span>날씨 불러오는 중...</span></div>' +
        '</div>' +
      '</div>';

    _bindHeaderEvents(containerId);
    _bindTabEvents(containerId);
    _fetch(containerId, false);
    _scheduleAutoRefresh(containerId);
  }

  /* ── 헤더 이벤트 ── */
  function _bindHeaderEvents(containerId) {
    document.getElementById(containerId + '_cityedit').addEventListener('click', function() {
      var bar = document.getElementById(containerId + '_citybar');
      var inp = document.getElementById(containerId + '_cityinp');
      bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
      if (inp) { inp.value = DashStorage.loadWeatherCity(); inp.focus(); }
    });
    document.getElementById(containerId + '_refresh').addEventListener('click', function() {
      _clearCache();
      _fetch(containerId, true);
    });
    document.getElementById(containerId + '_cityok').addEventListener('click', function() {
      _applyCity(containerId);
    });
    document.getElementById(containerId + '_citycancel').addEventListener('click', function() {
      document.getElementById(containerId + '_citybar').style.display = 'none';
    });
    document.getElementById(containerId + '_cityinp').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _applyCity(containerId);
    });
  }

  function _applyCity(containerId) {
    var inp  = document.getElementById(containerId + '_cityinp');
    var city = inp ? inp.value.trim() : '';
    if (!city) return;
    DashStorage.saveWeatherCity(city);
    document.getElementById(containerId + '_citybar').style.display = 'none';
    _clearCache();
    _fetch(containerId, true);
  }

  /* ── 탭 이벤트 ── */
  function _bindTabEvents(containerId) {
    var tabs = document.getElementById(containerId + '_tabs');
    if (!tabs) return;
    tabs.addEventListener('click', function(e) {
      var btn = e.target.closest('.weather-tab');
      if (!btn) return;
      tabs.querySelectorAll('.weather-tab').forEach(function(t) { t.classList.remove('active'); });
      btn.classList.add('active');
      _renderTab(containerId, btn.dataset.tab);
    });
  }

  /* ── 캐시 ── */
  function _getCache(city) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj.city !== city) return null;
      if (Date.now() - obj.ts > CACHE_TTL) return null;
      return obj.data;
    } catch(e) { return null; }
  }
  function _setCache(city, data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city, ts: Date.now(), data: data }));
    } catch(e) {}
  }
  function _clearCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  /* ── 데이터 fetch ── */
  var _lastData = {};

  function _fetch(containerId, forceRefresh) {
    var city   = DashStorage.loadWeatherCity();
    var body   = document.getElementById(containerId + '_body');
    if (!body) return;

    if (!forceRefresh) {
      var cached = _getCache(city);
      if (cached) {
        _lastData[containerId] = { data: cached, city: city };
        _renderTab(containerId, _activeTab(containerId));
        return;
      }
    }

    body.innerHTML = '<div class="weather-loading"><div class="spinner"></div><span>날씨 불러오는 중...</span></div>';

    var url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1&lang=ko';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 10000;
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          _setCache(city, data);
          _lastData[containerId] = { data: data, city: city };
          _renderTab(containerId, _activeTab(containerId));
        } catch(e) { _renderError(containerId, '데이터 파싱 오류'); }
      } else {
        _renderError(containerId, '날씨 정보를 불러올 수 없습니다 (' + xhr.status + ')');
      }
    };
    xhr.ontimeout = function() { _renderError(containerId, '요청 시간 초과'); };
    xhr.send();
  }

  function _activeTab(containerId) {
    var tabs = document.getElementById(containerId + '_tabs');
    if (!tabs) return 'current';
    var active = tabs.querySelector('.weather-tab.active');
    return active ? active.dataset.tab : 'current';
  }

  /* ── 탭별 렌더 분기 ── */
  function _renderTab(containerId, tab) {
    var cache = _lastData[containerId];
    if (!cache) return;
    if (tab === 'current')  _renderCurrent(containerId, cache.data, cache.city);
    else if (tab === 'hourly')   _renderHourly(containerId, cache.data);
    else if (tab === 'forecast') _renderForecast(containerId, cache.data);
  }

  /* ── 현재 날씨 ── */
  function _renderCurrent(containerId, data, city) {
    var body = document.getElementById(containerId + '_body');
    if (!body) return;
    var cur      = data.current_condition[0];
    var tempC    = _e(cur.temp_C);
    var feelsC   = _e(cur.FeelsLikeC);
    var humidity = _e(cur.humidity);
    var windKm   = _e(cur.windspeedKmph);
    var vis      = _e(cur.visibility || '-');
    var uvIdx    = _e(cur.uvIndex || '0');
    city         = _e(city);
    var wcode    = parseInt(cur.weatherCode);
    var icon     = WMO_ICONS[wcode] || '🌡️';
    var desc     = WMO_DESC[wcode]  || '알 수 없음';
    var updated  = _timeStr();

    body.innerHTML =
      '<div class="weather-current">' +
        '<div class="weather-icon">' + icon + '</div>' +
        '<div class="weather-temp-block">' +
          '<div class="weather-temp">' + tempC + '°C</div>' +
          '<div class="weather-desc">' + desc + '</div>' +
          '<div class="weather-location">📍 ' + city + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="weather-details">' +
        '<div class="weather-detail-item"><div class="weather-detail-label">체감</div><div class="weather-detail-value">' + feelsC + '°</div></div>' +
        '<div class="weather-detail-item"><div class="weather-detail-label">습도</div><div class="weather-detail-value">' + humidity + '%</div></div>' +
        '<div class="weather-detail-item"><div class="weather-detail-label">풍속</div><div class="weather-detail-value">' + windKm + 'km</div></div>' +
        '<div class="weather-detail-item"><div class="weather-detail-label">자외선</div><div class="weather-detail-value">' + uvIdx + '</div></div>' +
        '<div class="weather-detail-item"><div class="weather-detail-label">가시</div><div class="weather-detail-value">' + vis + 'km</div></div>' +
        '<div class="weather-detail-item"><div class="weather-detail-label">갱신</div><div class="weather-detail-value" style="font-size:10px;">' + updated + '</div></div>' +
      '</div>';
  }

  /* 외부 응답·저장값을 HTML 에 넣기 전 이스케이프 */
  function _e(v) {
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ── 시간별 예보 ── */
  function _renderHourly(containerId, data) {
    var body = document.getElementById(containerId + '_body');
    if (!body) return;
    var today  = data.weather[0];
    var hourly = today.hourly || [];

    var html = '<div class="weather-hourly">';
    hourly.forEach(function(h) {
      var timeVal = parseInt(h.time) / 100;
      var timeStr = (timeVal < 10 ? '0' : '') + timeVal + ':00';
      var wcode   = parseInt(h.weatherCode);
      var icon    = WMO_ICONS[wcode] || '🌡️';
      var prob    = _e(h.chanceofrain || '0');
      html +=
        '<div class="hourly-item">' +
          '<div class="hourly-time">' + timeStr + '</div>' +
          '<div class="hourly-icon">' + icon + '</div>' +
          '<div class="hourly-temp">' + _e(h.tempC) + '°</div>' +
          '<div class="hourly-rain">💧' + prob + '%</div>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  /* ── 3일 예보 ── */
  function _renderForecast(containerId, data) {
    var body = document.getElementById(containerId + '_body');
    if (!body) return;

    var html = '<div class="weather-forecast-full">';
    (data.weather || []).forEach(function(day) {
      var dateObj = new Date(day.date);
      var dayName = DAYS_KO[dateObj.getDay()];
      var dateStr = (dateObj.getMonth()+1) + '/' + dateObj.getDate();
      var dc      = parseInt((day.hourly[4] || day.hourly[0]).weatherCode);
      var fi      = WMO_ICONS[dc] || '🌡️';
      var desc    = WMO_DESC[dc]  || '';
      var rain    = day.hourly.reduce(function(acc, h) { return Math.max(acc, parseInt(h.chanceofrain||0)); }, 0);
      html +=
        '<div class="forecast-full-item">' +
          '<div class="forecast-full-left">' +
            '<span class="forecast-full-day">' + dayName + ' ' + dateStr + '</span>' +
            '<span class="forecast-full-icon">' + fi + '</span>' +
            '<span class="forecast-full-desc">' + desc + '</span>' +
          '</div>' +
          '<div class="forecast-full-right">' +
            '<span class="forecast-full-rain">💧' + rain + '%</span>' +
            '<span class="forecast-full-temp">' +
              '<span class="high">' + _e(day.maxtempC) + '°</span>' +
              ' / ' +
              '<span class="low">' + _e(day.mintempC) + '°</span>' +
            '</span>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  /* ── 에러 ── */
  function _renderError(containerId, msg) {
    var body = document.getElementById(containerId + '_body');
    if (!body) return;
    body.innerHTML =
      '<div class="weather-error">' +
        '<span style="font-size:32px">🌐</span>' +
        '<span>' + msg + '</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="WeatherWidget.refresh(\'' + containerId + '\')">다시 시도</button>' +
      '</div>';
  }

  /* ── 자동 갱신 ── */
  function _scheduleAutoRefresh(containerId) {
    if (_timers[containerId]) clearInterval(_timers[containerId]);
    _timers[containerId] = setInterval(function() {
      _clearCache();
      _fetch(containerId, true);
    }, CACHE_TTL);
  }

  function _timeStr() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function refresh(containerId) { _clearCache(); _fetch(containerId, true); }

  function defaultConfig() {
    return { id: 'weather_' + Date.now(), type: 'weather', x: 0, y: 0, w: 3, h: 5 };
  }

  return { render, refresh, defaultConfig };
})();
