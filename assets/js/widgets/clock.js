/* ========================================
   clock.js — 시계 위젯
   ======================================== */
const ClockWidget = (() => {
  var _timer = null;

  var DAYS_KO = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function render(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="widget clock-widget">' +
        '<div class="widget-header">' +
          '<span class="widget-title"><span class="icon">🕐</span> 시계</span>' +
          '<div class="widget-actions">' +
            '<button class="widget-action-btn danger" onclick="DashGrid.removeWidget(\'' + containerId + '\')" title="삭제">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="widget-body">' +
          '<div class="clock-time" id="' + containerId + '_time">00<span class="clock-seconds">:00</span>:00</div>' +
          '<div class="clock-date" id="' + containerId + '_date">-</div>' +
          '<div class="clock-day"  id="' + containerId + '_day">-</div>' +
        '</div>' +
      '</div>';
    tick(containerId);
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function() { tick(containerId); }, 1000);
  }

  function tick(containerId) {
    var now  = new Date();
    var h    = pad(now.getHours());
    var m    = pad(now.getMinutes());
    var s    = pad(now.getSeconds());

    var timeEl = document.getElementById(containerId + '_time');
    var dateEl = document.getElementById(containerId + '_date');
    var dayEl  = document.getElementById(containerId + '_day');
    if (!timeEl) return;

    timeEl.innerHTML = h + ':' + m + '<span class="clock-seconds">:' + s + '</span>';
    dateEl.textContent = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
    dayEl.textContent  = DAYS_KO[now.getDay()];
  }

  function defaultConfig() {
    return { id: 'clock_' + Date.now(), type: 'clock', x: 0, y: 0, w: 2, h: 2 };
  }

  return { render, defaultConfig };
})();
