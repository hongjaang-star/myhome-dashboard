/* ========================================
   storage.js — localStorage 관리 모듈
   (Google Drive 동기화 시 로컬 캐시 역할 — drive-sync.js 가 onChange 로 변경을 감지)
   ======================================== */
const DashStorage = (() => {

  const PREFIX = 'mydash_';

  const keys = {
    GRID_LAYOUT : PREFIX + 'grid_layout',
    THEME       : PREFIX + 'theme',
    BG_IMAGE    : PREFIX + 'bg_image',
    SEARCH_ENG  : PREFIX + 'search_engine',
    BOOKMARKS   : PREFIX + 'bookmarks',
    CAL_EVENTS  : PREFIX + 'cal_events',
    MEMO        : PREFIX + 'memo',
    WEATHER_CITY: PREFIX + 'weather_city',
    WIDGET_DATA : PREFIX + 'widget_data',
  };

  var _listeners = [];
  function onChange(fn) { _listeners.push(fn); }
  function _notify() {
    _listeners.forEach(function(fn) { try { fn(); } catch(e) { console.warn(e); } });
  }

  function get(key, defaultVal) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return defaultVal;
      return JSON.parse(raw);
    } catch(e) {
      return defaultVal;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      _notify();
      return true;
    } catch(e) {
      console.warn('DashStorage.set error:', e);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(key);
    _notify();
  }

  function exportAll() {
    var data = {};
    for (var k in keys) {
      var raw = localStorage.getItem(keys[k]);
      if (raw !== null) data[keys[k]] = raw;
    }
    return data;
  }

  function _isKnownKey(key) {
    for (var k in keys) { if (keys[k] === key) return true; }
    return false;
  }

  /* 설정 파일 가져오기 — 알려진 키 + 유효한 JSON 문자열만 반영 */
  function importAll(data) {
    if (!data || typeof data !== 'object') return false;
    var count = 0;
    for (var k in data) {
      if (!_isKnownKey(k) || typeof data[k] !== 'string') continue;
      try { JSON.parse(data[k]); } catch(e) { continue; }
      localStorage.setItem(k, data[k]);
      count++;
    }
    if (!count) return false;
    _notify();
    return true;
  }

  /* Drive 에서 받은 데이터로 통째로 교체 (변경 알림 없음 — 동기화 루프 방지) */
  function replaceAll(data) {
    if (!data || typeof data !== 'object') return false;
    for (var k in keys) {
      var key = keys[k];
      if (typeof data[key] === 'string') localStorage.setItem(key, data[key]);
      else localStorage.removeItem(key);
    }
    return true;
  }

  /* ── 그리드 레이아웃 ── */
  function saveLayout(layoutArr) {
    return set(keys.GRID_LAYOUT, layoutArr);
  }

  function loadLayout() {
    return get(keys.GRID_LAYOUT, null);
  }

  function resetLayout() {
    remove(keys.GRID_LAYOUT);
  }

  /* ── 테마 ── */
  function saveTheme(theme) { return set(keys.THEME, theme); }
  function loadTheme() { return get(keys.THEME, 'theme-dark'); }

  function saveBgImage(url) { return set(keys.BG_IMAGE, url); }
  function loadBgImage() { return get(keys.BG_IMAGE, ''); }

  /* ── 검색엔진 ── */
  function saveSearchEngine(engine) { return set(keys.SEARCH_ENG, engine); }
  function loadSearchEngine() { return get(keys.SEARCH_ENG, 'google'); }

  /* ── 즐겨찾기 ── */
  function saveBookmarks(groups) { return set(keys.BOOKMARKS, groups); }
  function loadBookmarks() {
    return get(keys.BOOKMARKS, [
      {
        id: 'grp_default',
        name: '자주 쓰는 사이트',
        color: '#5c7cfa',
        links: [
          { id: 'lnk_gmail',  name: 'Gmail',  url: 'https://gmail.com',        icon: 'https://www.google.com/favicon.ico' },
          { id: 'lnk_naver',  name: 'Naver',  url: 'https://naver.com',        icon: 'https://static.nid.naver.com/images/2024/favicon/favicon.ico' },
          { id: 'lnk_yt',     name: 'YouTube',url: 'https://youtube.com',      icon: 'https://youtube.com/favicon.ico' },
          { id: 'lnk_github', name: 'GitHub', url: 'https://github.com',       icon: 'https://github.com/favicon.ico' },
        ]
      }
    ]);
  }

  /* ── 달력 이벤트 ── */
  function saveCalEvents(events) { return set(keys.CAL_EVENTS, events); }
  function loadCalEvents() { return get(keys.CAL_EVENTS, {}); }

  /* ── 메모 ── */
  function saveMemo(text) { return set(keys.MEMO, text); }
  function loadMemo() { return get(keys.MEMO, ''); }

  /* ── 날씨 도시 ── */
  function saveWeatherCity(city) { return set(keys.WEATHER_CITY, city); }
  function loadWeatherCity() { return get(keys.WEATHER_CITY, '광주'); }

  /* ── 위젯별 커스텀 데이터 ── */
  function saveWidgetData(widgetId, data) {
    var all = get(keys.WIDGET_DATA, {});
    all[widgetId] = data;
    return set(keys.WIDGET_DATA, all);
  }
  function loadWidgetData(widgetId, defaultVal) {
    var all = get(keys.WIDGET_DATA, {});
    return (widgetId in all) ? all[widgetId] : (defaultVal || null);
  }

  return {
    keys,
    get, set, remove,
    onChange,
    exportAll, importAll, replaceAll,
    saveLayout, loadLayout, resetLayout,
    saveTheme, loadTheme,
    saveBgImage, loadBgImage,
    saveSearchEngine, loadSearchEngine,
    saveBookmarks, loadBookmarks,
    saveCalEvents, loadCalEvents,
    saveMemo, loadMemo,
    saveWeatherCity, loadWeatherCity,
    saveWidgetData, loadWidgetData,
  };
})();
