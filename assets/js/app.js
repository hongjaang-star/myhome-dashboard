/* ========================================
   app.js — 메인 앱 초기화 & 이벤트 연결
   ======================================== */
(function() {

  var SEARCH_URLS = {
    google: 'https://www.google.com/search?q=',
    naver : 'https://search.naver.com/search.naver?query=',
    bing  : 'https://www.bing.com/search?q=',
  };

  var currentEngine = 'google';
  var isEditMode    = false;

  /* ── 초기화 ── */
  function init() {
    _applyTheme(DashStorage.loadTheme());
    _applyBgImage(DashStorage.loadBgImage());
    _initSearch();
    _initEditMode();
    _initSettings();
    _initAddWidget();
    DashGrid.init();
    _initSync();
    _initTabWatch();
  }

  /* 같은 기기의 다른 탭에서 데이터가 바뀌면 이 탭도 갱신 (오래된 탭이 최신 내용을 덮어쓰지 않도록) */
  function _initTabWatch() {
    var stale = false;
    function apply() { if (stale) { stale = false; refresh(); } }
    window.addEventListener('storage', function(e) {
      if (!e.key || e.key.indexOf('mydash_') !== 0 || e.key === 'mydash_weather_cache') return;
      stale = true;
      if (!document.hasFocus()) apply();
    });
    window.addEventListener('focus', apply);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') apply();
    });
  }

  /* 저장소 내용이 통째로 바뀌었을 때(Drive 불러오기 등) 화면 전체 반영 */
  function refresh() {
    var theme = DashStorage.loadTheme();
    _applyTheme(theme);
    _applyBgImage(DashStorage.loadBgImage());
    currentEngine = DashStorage.loadSearchEngine();
    _setEngineActive(currentEngine);
    document.querySelectorAll('.theme-opt').forEach(function(b) {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    DashGrid.reload();
  }

  /* ── Google Drive 동기화 ── */
  var SYNC_VIEW = {
    local  : { label: '☁ 로그인',   cls: 'is-off',  title: 'Google 로그인하면 Drive 에 저장되어 어디서든 사용할 수 있습니다' },
    pending: { label: '⏳ 대기',     cls: 'is-busy', title: '변경 사항 저장 대기' },
    syncing: { label: '⏳ 동기화',   cls: 'is-busy', title: 'Drive 와 동기화 중' },
    synced : { label: '☁ 저장됨',   cls: 'is-ok',   title: 'Google Drive 에 저장됨' },
    reauth : { label: '🔄 재연결',   cls: 'is-warn', title: 'Google 재연결이 필요합니다 (클릭)' },
    offline: { label: '⚠ 오프라인', cls: 'is-warn', title: '오프라인 — 연결되면 다시 저장합니다' },
    error  : { label: '⚠ 오류',     cls: 'is-err',  title: 'Drive 동기화 오류 (클릭하여 재시도)' },
  };

  function _initSync() {
    var btn     = document.getElementById('syncBtn');
    var overlay = document.getElementById('loginOverlay');
    var note    = document.getElementById('loginNote');

    DashSync.onStatus(function(status, msg) {
      var v = SYNC_VIEW[status] || SYNC_VIEW.local;
      btn.textContent = v.label;
      btn.className = 'sync-btn ' + v.cls;
      btn.title = msg || v.title;
      _renderSyncInfo();
    });

    if (!DashSync.isConfigured()) {
      note.textContent = '⚠ 관리자 설정 필요: assets/js/config.js 에 GOOGLE_CLIENT_ID 를 입력해야 로그인할 수 있습니다.';
      document.getElementById('loginGoogleBtn').disabled = true;
    }

    var firstVisit = DashSync.init();
    if (firstVisit) overlay.style.display = 'flex';

    function signIn() {
      note.textContent = '';
      return DashSync.signIn().then(function() {
        overlay.style.display = 'none';
        DashGrid.toast('Google Drive 와 연결되었습니다 ✓');
      }).catch(function(e) {
        note.textContent = e.message;
        if (overlay.style.display !== 'flex') DashGrid.toast(e.message);
      });
    }

    document.getElementById('loginGoogleBtn').addEventListener('click', signIn);
    document.getElementById('loginLocalBtn').addEventListener('click', function() {
      DashSync.useLocalOnly();
      overlay.style.display = 'none';
    });

    btn.addEventListener('click', function() {
      var st = DashSync.getStatus().status;
      if (st === 'local') { overlay.style.display = 'flex'; return; }
      if (st === 'reauth') { signIn(); return; }
      if (st === 'error' || st === 'offline') { DashSync.syncNow(); return; }
      document.getElementById('settingsPanel').style.display = 'flex';
      _renderSyncInfo();
    });

    document.getElementById('syncLoginBtn').addEventListener('click', signIn);
    document.getElementById('syncNowBtn').addEventListener('click', function() {
      DashSync.syncNow().catch(function() {});
    });
    document.getElementById('syncPullBtn').addEventListener('click', function() {
      if (confirm('Drive 에 저장된 데이터로 이 기기의 대시보드를 덮어쓸까요?')) DashSync.pullFromDrive();
    });
    document.getElementById('syncPushBtn').addEventListener('click', function() {
      if (confirm('이 기기의 대시보드로 Drive 데이터를 덮어쓸까요?\n(Drive 는 이전 버전을 보관하므로 Drive 웹의 "버전 관리"에서 되돌릴 수 있습니다)')) {
        DashSync.pushForce();
      }
    });
    document.getElementById('syncRestoreBtn').addEventListener('click', function() {
      var b = DashSync.getBackupInfo();
      if (!b) return;
      if (confirm('이 기기 데이터를 ' + new Date(b.time).toLocaleString('ko-KR') + ' 백업(' + b.reason + ')으로 되돌릴까요?\n(현재 상태는 다시 백업됩니다)')) {
        DashSync.restoreBackup();
        DashGrid.toast('이전 데이터로 복원했습니다');
      }
    });
    document.getElementById('syncLogoutBtn').addEventListener('click', function() {
      if (!confirm('Google 계정 연결을 해제할까요?\n(Drive 파일은 삭제되지 않습니다)')) return;
      var wipe = confirm('이 기기에 저장된 대시보드 데이터(메모·즐겨찾기·일정)도 삭제할까요?\n\n공용 PC 라면 [확인]을 누르세요.\n[취소] 를 누르면 이 기기에 데이터를 남겨 둡니다.');
      DashSync.signOut(wipe);
      _renderSyncInfo();
    });
  }

  function _renderSyncInfo() {
    var info = document.getElementById('syncInfo');
    if (!info) return;
    var drive = DashSync.getMode() === 'drive';
    var st    = DashSync.getStatus();
    var last  = DashSync.getLastSync();
    var lines = [];
    if (drive) {
      lines.push('계정: ' + (DashSync.getEmail() || '(확인 중)'));
      lines.push('마지막 동기화: ' + (last ? new Date(last).toLocaleString('ko-KR') : '-'));
      lines.push('저장 위치: 내 드라이브 › ' + ((window.DASH_CONFIG || {}).DRIVE_FOLDER_NAME || 'MyHome Dashboard'));
    } else {
      lines.push('이 기기에만 저장 중입니다. 로그인하면 Google Drive 에 저장되어 어느 기기에서든 같은 대시보드를 사용할 수 있습니다.');
    }
    /* 상태 줄은 항상 1줄로 고정 — 상태가 바뀌어도 아래 버튼 위치가 밀리지 않도록 */
    var label = (SYNC_VIEW[st.status] || SYNC_VIEW.local).title;
    info.innerHTML = '';
    info.appendChild(document.createTextNode(lines.join('\n')));
    var stEl = document.createElement('div');
    stEl.className = 'sync-info__status';
    stEl.textContent = '상태: ' + (st.message || label);
    stEl.title = stEl.textContent;
    info.appendChild(stEl);
    var backup = DashSync.getBackupInfo();
    document.getElementById('syncRestoreBtn').style.display = backup ? '' : 'none';
    if (backup) document.getElementById('syncRestoreBtn').title = new Date(backup.time).toLocaleString('ko-KR') + ' · ' + backup.reason;
    document.getElementById('syncPushBtn').style.display   = drive ? '' : 'none';
    document.getElementById('syncLoginBtn').style.display  = drive ? 'none' : '';
    document.getElementById('syncNowBtn').style.display    = drive ? '' : 'none';
    document.getElementById('syncPullBtn').style.display   = drive ? '' : 'none';
    document.getElementById('syncLogoutBtn').style.display = drive ? '' : 'none';
  }

  /* ── 테마 적용 ── */
  function _applyTheme(theme) {
    document.body.className = document.body.className
      .replace(/theme-\S+/g, '').trim();
    document.body.classList.add(theme);
    var btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'theme-dark' ? '☀️' : '🌙';
  }

  function _applyBgImage(url) {
    url = String(url || '').trim();
    if (url && /^https?:\/\//i.test(url)) {
      /* CSS url() 를 깨는 문자 인코딩 */
      var safe = url.replace(/["'()\\\s]/g, function(c) { return encodeURIComponent(c); });
      document.documentElement.style.setProperty('--bg-image', 'url("' + safe + '")');
    } else {
      document.documentElement.style.removeProperty('--bg-image');
    }
  }

  /* ── 검색 ── */
  function _initSearch() {
    currentEngine = DashStorage.loadSearchEngine();
    _setEngineActive(currentEngine);

    document.querySelectorAll('.engine-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentEngine = btn.dataset.engine;
        _setEngineActive(currentEngine);
        DashStorage.saveSearchEngine(currentEngine);
      });
    });

    document.getElementById('searchForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var q = document.getElementById('searchInput').value.trim();
      if (!q) return;
      var url = (SEARCH_URLS[currentEngine] || SEARCH_URLS.google) + encodeURIComponent(q);
      window.open(url, '_blank');
      document.getElementById('searchInput').value = '';
    });
  }

  function _setEngineActive(engine) {
    document.querySelectorAll('.engine-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.engine === engine);
    });
  }

  /* ── 편집 모드 ── */
  function _initEditMode() {
    document.getElementById('editModeBtn').addEventListener('click', function() {
      isEditMode = !isEditMode;
      if (isEditMode) {
        DashGrid.enableEdit();
        document.getElementById('editToolbar').style.display = 'flex';
      } else {
        DashGrid.disableEdit();
      }
    });

    document.getElementById('saveLayoutBtn').addEventListener('click', function() {
      DashGrid.saveLayout();
      isEditMode = false;
    });

    document.getElementById('resetLayoutBtn').addEventListener('click', function() {
      DashGrid.resetLayout();
    });

    document.getElementById('exitEditBtn').addEventListener('click', function() {
      DashGrid.disableEdit();
      isEditMode = false;
    });
  }

  /* ── 위젯 추가 모달 ── */
  function _initAddWidget() {
    var modal   = document.getElementById('addWidgetModal');
    var addBtn  = document.getElementById('addWidgetBtn');
    var closeBtn= document.getElementById('closeAddWidgetModal');

    addBtn.addEventListener('click', function() {
      modal.style.display = 'flex';
    });
    closeBtn.addEventListener('click', function() {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.querySelectorAll('.widget-pick-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var type = item.dataset.widget;
        DashGrid.addWidget(type);
        modal.style.display = 'none';
      });
    });
  }

  /* ── 설정 패널 ── */
  function _initSettings() {
    var panel    = document.getElementById('settingsPanel');
    var openBtn  = document.getElementById('settingsBtn');
    var closeBtn = document.getElementById('closeSettingsBtn');
    var themeBtn = document.getElementById('themeToggleBtn');

    openBtn.addEventListener('click', function() {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      if (panel.style.display === 'flex') {
        var inp = document.getElementById('bgImageInput');
        if (inp) inp.value = DashStorage.loadBgImage();
        _renderSyncInfo();
      }
    });
    closeBtn.addEventListener('click', function() { panel.style.display = 'none'; });

    themeBtn.addEventListener('click', function() {
      var cur  = DashStorage.loadTheme();
      var next = cur === 'theme-dark' ? 'theme-light' : 'theme-dark';
      _applyTheme(next);
      DashStorage.saveTheme(next);
    });

    document.querySelectorAll('.theme-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var t = btn.dataset.theme;
        _applyTheme(t);
        DashStorage.saveTheme(t);
        document.querySelectorAll('.theme-opt').forEach(function(b) {
          b.classList.toggle('active', b.dataset.theme === t);
        });
      });
    });

    document.getElementById('applyBgBtn').addEventListener('click', function() {
      var url = document.getElementById('bgImageInput').value.trim();
      _applyBgImage(url);
      DashStorage.saveBgImage(url);
    });
    document.getElementById('clearBgBtn').addEventListener('click', function() {
      document.getElementById('bgImageInput').value = '';
      _applyBgImage('');
      DashStorage.saveBgImage('');
    });

    document.getElementById('exportSettingsBtn').addEventListener('click', function() {
      var data = DashStorage.exportAll();
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url;
      a.download = 'mydash_settings_' + _dateStr() + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('importSettingsBtn').addEventListener('click', function() {
      document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = JSON.parse(ev.target.result);
          DashSync.backupLocal('설정 파일 가져오기 전');
          if (!DashStorage.importAll(data)) throw new Error('no valid keys');   // 동기화 모드면 Drive 에도 자동 업로드됨
          refresh();
          DashGrid.toast('설정을 가져왔습니다 ✓ (설정 › 이전 데이터 복원으로 되돌릴 수 있음)');
        } catch(err) {
          alert('유효하지 않은 설정 파일입니다.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  function _dateStr() {
    var d = new Date();
    return d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2);
  }

  window.DashApp = { refresh: refresh };

  /* ── DOM Ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
