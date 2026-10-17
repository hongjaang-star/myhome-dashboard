/* ========================================
   memo.js — 메모 위젯
   ======================================== */
const MemoWidget = (() => {

  function render(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var saved = DashStorage.loadWidgetData(containerId + '_memo', '');

    el.innerHTML =
      '<div class="widget memo-widget">' +
        '<div class="widget-header">' +
          '<span class="widget-title"><span class="icon">📝</span> 메모</span>' +
          '<div class="widget-actions">' +
            '<button class="widget-action-btn" id="' + containerId + '_clear" title="지우기">🗑</button>' +
            '<button class="widget-action-btn danger" onclick="DashGrid.removeWidget(\'' + containerId + '\')" title="삭제">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="widget-body">' +
          '<textarea class="memo-textarea" id="' + containerId + '_ta" placeholder="여기에 메모를 입력하세요...">' + _esc(saved) + '</textarea>' +
          '<div class="memo-footer" id="' + containerId + '_footer">0자</div>' +
        '</div>' +
      '</div>';

    var ta     = document.getElementById(containerId + '_ta');
    var footer = document.getElementById(containerId + '_footer');
    var clrBtn = document.getElementById(containerId + '_clear');

    function updateCount() {
      footer.textContent = ta.value.length + '자';
    }
    updateCount();

    var saveTimer = null;
    ta.addEventListener('input', function() {
      updateCount();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        DashStorage.saveWidgetData(containerId + '_memo', ta.value);
      }, 800);
    });

    clrBtn.addEventListener('click', function() {
      if (confirm('메모를 지우시겠습니까?')) {
        ta.value = '';
        updateCount();
        DashStorage.saveWidgetData(containerId + '_memo', '');
      }
    });
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function defaultConfig() {
    return { id: 'memo_' + Date.now(), type: 'memo', x: 0, y: 0, w: 3, h: 3 };
  }

  return { render, defaultConfig };
})();
