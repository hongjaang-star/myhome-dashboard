/* ========================================
   calendar.js — 달력 위젯 (Phase 2 고도화)
   - 일정 색상 태그 지원
   - 미니/풀 모드 토글
   - 오늘로 이동 버튼
   - 일정 목록 사이드 패널
   - 키보드 입력(Enter) 지원
   ======================================== */
const CalendarWidget = (() => {

  var _state = {};

  var MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var DAYS_KO   = ['일','월','화','수','목','금','토'];

  var EVENT_COLORS = [
    { key:'blue',   label:'파랑', color:'#5c7cfa' },
    { key:'red',    label:'빨강', color:'#f03e3e' },
    { key:'green',  label:'초록', color:'#20c997' },
    { key:'orange', label:'주황', color:'#fd7e14' },
    { key:'purple', label:'보라', color:'#cc5de8' },
    { key:'pink',   label:'분홍', color:'#e64980' },
  ];

  function _colorOf(key) {
    for (var i = 0; i < EVENT_COLORS.length; i++) {
      if (EVENT_COLORS[i].key === key) return EVENT_COLORS[i].color;
    }
    return '#5c7cfa';
  }

  /* ── 렌더 진입점 ── */
  function render(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var now = new Date();
    _state[containerId] = {
      year : now.getFullYear(),
      month: now.getMonth(),
      mini : false,
      selectedDate: null,
    };
    _draw(containerId);
  }

  /* ── 전체 뼈대 ── */
  function _draw(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML =
      '<div class="widget calendar-widget" id="' + containerId + '_root">' +
        '<div class="widget-header">' +
          '<span class="widget-title"><span class="icon">📅</span> 달력</span>' +
          '<div class="widget-actions">' +
            '<button class="widget-action-btn" id="' + containerId + '_today" title="오늘로 이동">◎</button>' +
            '<button class="widget-action-btn" id="' + containerId + '_mini"  title="미니/풀 모드">⊟</button>' +
            '<button class="widget-action-btn danger" onclick="DashGrid.removeWidget(\'' + containerId + '\')" title="삭제">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="widget-body cal-body">' +
          '<div class="calendar-nav">' +
            '<button class="cal-nav-btn" id="' + containerId + '_prev">◀</button>' +
            '<span class="cal-month-label" id="' + containerId + '_label"></span>' +
            '<button class="cal-nav-btn" id="' + containerId + '_next">▶</button>' +
          '</div>' +
          '<div class="calendar-grid" id="' + containerId + '_grid"></div>' +
          '<div class="cal-event-side" id="' + containerId + '_side" style="display:none;"></div>' +
        '</div>' +
      '</div>';

    document.getElementById(containerId + '_prev').addEventListener('click', function() {
      var s = _state[containerId];
      s.month--;
      if (s.month < 0) { s.month = 11; s.year--; }
      _updateGrid(containerId);
    });
    document.getElementById(containerId + '_next').addEventListener('click', function() {
      var s = _state[containerId];
      s.month++;
      if (s.month > 11) { s.month = 0; s.year++; }
      _updateGrid(containerId);
    });
    document.getElementById(containerId + '_today').addEventListener('click', function() {
      var now = new Date();
      var s   = _state[containerId];
      s.year  = now.getFullYear();
      s.month = now.getMonth();
      _updateGrid(containerId);
    });
    document.getElementById(containerId + '_mini').addEventListener('click', function() {
      var s = _state[containerId];
      s.mini = !s.mini;
      var root = document.getElementById(containerId + '_root');
      if (root) root.classList.toggle('cal-mini', s.mini);
      document.getElementById(containerId + '_mini').textContent = s.mini ? '⊞' : '⊟';
      _updateGrid(containerId);
    });

    _updateGrid(containerId);
  }

  /* ── 그리드 업데이트 ── */
  function _updateGrid(containerId) {
    var st    = _state[containerId];
    var year  = st.year;
    var month = st.month;
    var today = new Date();

    var label = document.getElementById(containerId + '_label');
    var grid  = document.getElementById(containerId + '_grid');
    if (!label || !grid) return;

    label.textContent = year + '년 ' + MONTHS_KO[month];

    var html = '';
    for (var d = 0; d < 7; d++) {
      html += '<div class="cal-day-name">' + DAYS_KO[d] + '</div>';
    }

    var firstDay  = new Date(year, month, 1).getDay();
    var lastDate  = new Date(year, month + 1, 0).getDate();
    var prevLast  = new Date(year, month, 0).getDate();
    var events    = DashStorage.loadCalEvents();

    for (var i = 0; i < firstDay; i++) {
      var d2 = prevLast - firstDay + 1 + i;
      html += '<div class="cal-day other-month">' + d2 + '</div>';
    }

    for (var d3 = 1; d3 <= lastDate; d3++) {
      var dateStr = year + '-' + _pad(month + 1) + '-' + _pad(d3);
      var dow     = new Date(year, month, d3).getDay();
      var cls     = 'cal-day';
      if (dow === 0) cls += ' sunday';
      if (dow === 6) cls += ' saturday';
      if (year === today.getFullYear() && month === today.getMonth() && d3 === today.getDate()) cls += ' today';
      if (st.selectedDate === dateStr) cls += ' selected';

      var evList = events[dateStr] || [];
      var dotHtml = '';
      if (!st.mini && evList.length > 0) {
        var shown = evList.slice(0, 3);
        dotHtml = '<div class="cal-ev-dots">';
        shown.forEach(function(ev) {
          var c = _colorOf(ev.color || 'blue');
          dotHtml += '<span class="cal-ev-dot" style="background:' + c + '"></span>';
        });
        dotHtml += '</div>';
      } else if (evList.length > 0) {
        cls += ' has-event';
      }

      html += '<div class="' + cls + '" data-date="' + dateStr + '" data-cid="' + containerId + '">' +
                d3 + dotHtml +
              '</div>';
    }

    var totalCells = firstDay + lastDate;
    var remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var r = 1; r <= remaining; r++) {
      html += '<div class="cal-day other-month">' + r + '</div>';
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day[data-date]').forEach(function(dayEl) {
      dayEl.addEventListener('click', function() {
        _state[containerId].selectedDate = dayEl.dataset.date;
        _updateGrid(containerId);
        _openSidePanel(containerId, dayEl.dataset.date);
      });
    });
  }

  /* ── 사이드 패널 (일정 목록 + 추가) ── */
  function _openSidePanel(containerId, dateStr) {
    var side = document.getElementById(containerId + '_side');
    if (!side) return;
    side.style.display = 'flex';
    _renderSidePanel(containerId, dateStr);
  }

  function _renderSidePanel(containerId, dateStr) {
    var side   = document.getElementById(containerId + '_side');
    if (!side) return;
    var events = DashStorage.loadCalEvents();
    var list   = events[dateStr] || [];

    var colorBtns = EVENT_COLORS.map(function(c) {
      return '<button class="cal-color-btn" data-color="' + c.key + '" title="' + c.label + '" style="background:' + c.color + '"></button>';
    }).join('');

    var listHtml = list.length === 0
      ? '<div class="cal-no-event">일정 없음</div>'
      : list.map(function(ev, i) {
          var c = _colorOf(ev.color || 'blue');
          return '<div class="cal-side-event">' +
            '<span class="cal-side-dot" style="background:' + c + '"></span>' +
            '<span class="cal-side-text">' + _esc(ev.text) + '</span>' +
            '<button class="cal-event-del" data-idx="' + i + '">✕</button>' +
          '</div>';
        }).join('');

    side.innerHTML =
      '<div class="cal-side-header">' +
        '<span class="cal-side-date">' + dateStr + '</span>' +
        '<button class="cal-side-close" id="' + containerId + '_sideclose">✕</button>' +
      '</div>' +
      '<div class="cal-side-list">' + listHtml + '</div>' +
      '<div class="cal-side-add">' +
        '<div class="cal-color-row" id="' + containerId + '_colorrow">' + colorBtns + '</div>' +
        '<div class="cal-side-input-row">' +
          '<input type="text" id="' + containerId + '_sidetxt" class="cal-side-input" placeholder="일정 추가..." maxlength="50">' +
          '<button class="btn btn-sm btn-primary" id="' + containerId + '_sideadd">추가</button>' +
        '</div>' +
      '</div>';

    var selectedColor = 'blue';
    side.querySelectorAll('.cal-color-btn').forEach(function(btn) {
      if (btn.dataset.color === selectedColor) btn.classList.add('active');
      btn.addEventListener('click', function() {
        selectedColor = btn.dataset.color;
        side.querySelectorAll('.cal-color-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    document.getElementById(containerId + '_sideclose').addEventListener('click', function() {
      side.style.display = 'none';
      _state[containerId].selectedDate = null;
      _updateGrid(containerId);
    });

    var addBtn = document.getElementById(containerId + '_sideadd');
    var txtInp = document.getElementById(containerId + '_sidetxt');

    function doAdd() {
      var val = txtInp.value.trim();
      if (!val) return;
      var evs = DashStorage.loadCalEvents();
      if (!evs[dateStr]) evs[dateStr] = [];
      evs[dateStr].push({ text: val, color: selectedColor });
      DashStorage.saveCalEvents(evs);
      txtInp.value = '';
      _renderSidePanel(containerId, dateStr);
      _updateGrid(containerId);
    }

    addBtn.addEventListener('click', doAdd);
    txtInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doAdd();
    });

    side.querySelectorAll('.cal-event-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.dataset.idx);
        var evs = DashStorage.loadCalEvents();
        if (evs[dateStr]) evs[dateStr].splice(idx, 1);
        DashStorage.saveCalEvents(evs);
        _renderSidePanel(containerId, dateStr);
        _updateGrid(containerId);
      });
    });
  }

  function _pad(n) { return n < 10 ? '0' + n : '' + n; }
  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function defaultConfig() {
    return { id: 'calendar_' + Date.now(), type: 'calendar', x: 0, y: 0, w: 4, h: 5 };
  }

  return { render, defaultConfig };
})();
