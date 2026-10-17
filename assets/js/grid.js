/* ========================================
   grid.js — Gridstack 드래그앤드랍 관리자
   ======================================== */
const DashGrid = (() => {

  var _grid   = null;
  var _items  = [];
  var _rendering = false;   /* 일괄 렌더링 중에는 레이아웃 저장 안 함 (중간 상태 저장 방지) */

  var WIDGET_MAP = {
    clock    : ClockWidget,
    calendar : CalendarWidget,
    weather  : WeatherWidget,
    bookmarks: BookmarksWidget,
    memo     : MemoWidget,
  };

  var DEFAULT_LAYOUT = [
    { id: 'clock_default',     type: 'clock',     x: 0, y: 0, w: 2, h: 3 },
    { id: 'weather_default',   type: 'weather',   x: 2, y: 0, w: 3, h: 5 },
    { id: 'bookmarks_default', type: 'bookmarks', x: 5, y: 0, w: 7, h: 5 },
    { id: 'calendar_default',  type: 'calendar',  x: 0, y: 3, w: 5, h: 5 },
    { id: 'memo_default',      type: 'memo',      x: 5, y: 5, w: 7, h: 3 },
  ];

  /* 저장소/Drive/가져오기 파일에서 온 레이아웃 검증 — 형식이 틀린 항목은 버림 */
  function _sanitize(layout) {
    if (!Array.isArray(layout)) return null;
    var seen = {};
    var out = layout.filter(function(i) {
      if (!i || typeof i.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(i.id)) return false;
      if (!WIDGET_MAP.hasOwnProperty(i.type) || seen[i.id]) return false;
      seen[i.id] = true;
      return true;
    }).map(function(i) {
      function n(v, d) { v = parseInt(v, 10); return (isNaN(v) || v < 0 || v > 200) ? d : v; }
      return { id: i.id, type: i.type, x: n(i.x, 0), y: n(i.y, 0), w: n(i.w, 3) || 3, h: n(i.h, 3) || 3 };
    });
    return out.length ? out : null;
  }

  function init() {
    _grid = GridStack.init({
      column       : 12,
      cellHeight   : 80,
      margin       : 8,
      animate      : true,
      float        : false,
      resizable    : { handles: 'se' },
      draggable    : { handle: '.widget-header' },
      disableDrag  : true,
      disableResize: true,
    }, '#mainGrid');

    _grid.on('change', function(event, items) {
      if (_rendering) return;
      _saveLayout();
    });

    /* 위젯 내부 drag 이벤트가 Gridstack 으로 전파되지 않도록 차단 */
    document.getElementById('mainGrid').addEventListener('dragstart', function(e) {
      var draggable = e.target.closest('[draggable="true"]');
      if (!draggable) return;
      /* grid-stack-item 자체가 아닌 위젯 내부 요소이면 전파 차단 */
      var gsItem = e.target.closest('.grid-stack-item');
      if (gsItem && !gsItem.isSameNode(draggable) && !draggable.classList.contains('grid-stack-item')) {
        e.stopPropagation();
      }
    }, true); /* capture 단계에서 먼저 처리 */

    var layout = _sanitize(DashStorage.loadLayout()) || DEFAULT_LAYOUT;
    _items = layout;
    _renderAll(layout);
  }

  function _renderAll(layout) {
    _rendering = true;
    try {
      _grid.removeAll();
      layout.forEach(function(item) {
        _addToGrid(item);
      });
    } finally {
      _rendering = false;
    }
  }

  function _addToGrid(item) {
    var el = document.createElement('div');
    el.className = 'grid-stack-item widget-enter';
    el.id = 'gsi_' + item.id;

    var content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    content.id = item.id;
    el.appendChild(content);

    _grid.addWidget(el, {
      x: item.x || 0,
      y: item.y || 0,
      w: item.w || 3,
      h: item.h || 3,
      id: item.id,
    });

    _renderWidget(item.type, item.id);
  }

  function _renderWidget(type, containerId) {
    var w = WIDGET_MAP[type];
    if (!w) {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = '<div class="widget"><div class="widget-body"><p style="color:var(--text-muted)">알 수 없는 위젯: ' + type + '</p></div></div>';
      return;
    }
    w.render(containerId);
  }

  function addWidget(type) {
    var w = WIDGET_MAP[type];
    if (!w) return;
    var cfg = w.defaultConfig();
    _items.push(cfg);
    _addToGrid(cfg);
    _saveLayout();
  }

  function removeWidget(containerId) {
    if (!confirm('위젯을 삭제하시겠습니까?')) return;
    var gsEl = document.getElementById('gsi_' + containerId);
    if (gsEl) _grid.removeWidget(gsEl, true);
    _items = _items.filter(function(i) { return i.id !== containerId; });
    _saveLayout();
  }

  function _saveLayout() {
    var gridItems = _grid.getGridItems();
    var layout = [];
    gridItems.forEach(function(el) {
      var node = el.gridstackNode;
      if (!node) return;
      var contentEl = el.querySelector('.grid-stack-item-content');
      if (!contentEl) return;
      var cid  = contentEl.id;
      var orig = null;
      for (var ii = 0; ii < _items.length; ii++) { if (_items[ii].id === cid) { orig = _items[ii]; break; } }
      if (!orig) return;
      layout.push({
        id  : cid,
        type: orig.type,
        x   : node.x,
        y   : node.y,
        w   : node.w,
        h   : node.h,
      });
    });
    _items = layout;
    DashStorage.saveLayout(layout);
  }

  function enableEdit() {
    _grid.enableMove(true);
    _grid.enableResize(true);
    document.body.classList.add('edit-mode');
    document.getElementById('editToolbar').style.display = 'flex';
  }

  function disableEdit() {
    _grid.enableMove(false);
    _grid.enableResize(false);
    document.body.classList.remove('edit-mode');
    document.getElementById('editToolbar').style.display = 'none';
  }

  function saveLayout() {
    _saveLayout();
    disableEdit();
    _showToast('레이아웃이 저장되었습니다 ✓');
  }

  function resetLayout() {
    if (!confirm('레이아웃을 초기 상태로 되돌릴까요?')) return;
    DashStorage.resetLayout();
    _items = DEFAULT_LAYOUT;
    _renderAll(DEFAULT_LAYOUT);
    _showToast('레이아웃이 초기화되었습니다');
  }

  /* 저장소(예: Drive 에서 받은 데이터) 기준으로 전체 다시 그리기 */
  function reload() {
    var layout = _sanitize(DashStorage.loadLayout()) || DEFAULT_LAYOUT;
    _items = layout;
    _renderAll(layout);
  }

  function _showToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'background:var(--accent)', 'color:#fff', 'padding:10px 20px',
      'border-radius:20px', 'font-size:13px', 'font-weight:600',
      'z-index:9999', 'box-shadow:0 4px 16px rgba(0,0,0,0.3)',
      'animation:fadeInUp 0.3s ease',
    ].join(';');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2500);
  }

  return {
    init,
    addWidget,
    removeWidget,
    enableEdit,
    disableEdit,
    saveLayout,
    resetLayout,
    reload,
    toast: _showToast,
  };
})();
