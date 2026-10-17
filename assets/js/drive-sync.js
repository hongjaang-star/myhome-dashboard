/* ========================================
   drive-sync.js — Google 로그인 + Google Drive 동기화
   ----------------------------------------
   - 서버 없이 브라우저에서 Google Identity Services(토큰 방식)로 인증
   - 데이터는 내 Drive 의 "MyHome Dashboard/dashboard_data.json" 한 파일에 저장
   - 권한 범위 drive.file : 이 앱이 만든 파일만 읽고 쓸 수 있음
   - localStorage 는 오프라인 캐시로 계속 사용하고, 변경 시 Drive 로 자동 업로드
   ======================================== */
const DashSync = (() => {

  var CFG       = window.DASH_CONFIG || {};
  var SCOPE     = 'https://www.googleapis.com/auth/drive.file';
  var API       = 'https://www.googleapis.com/drive/v3';
  var UPLOAD    = 'https://www.googleapis.com/upload/drive/v3';
  var FOLDER    = CFG.DRIVE_FOLDER_NAME || 'MyHome Dashboard';
  var FILE      = CFG.DRIVE_FILE_NAME   || 'dashboard_data.json';
  var PUSH_DELAY   = 1500;
  var CHECK_GAP    = 30000;

  /* 동기화 메타데이터 — 'mydash_' 접두어가 아니므로 내보내기/동기화 대상에서 제외됨 */
  var LS = {
    MODE : 'myhome_sync_mode',   // 'drive' | 'local'
    TOKEN: 'myhome_sync_token',  // { t, exp }
    EMAIL: 'myhome_sync_email',
    FILE : 'myhome_sync_file',   // Drive 파일 id
    HASH : 'myhome_sync_hash',   // 마지막으로 Drive 와 일치했던 데이터의 해시
    TIME : 'myhome_sync_time',   // 마지막 동기화 시각(ms)
    RTIME: 'myhome_sync_rtime',  // 마지막으로 확인한 Drive modifiedTime
    BACKUP: 'myhome_sync_backup', // 덮어쓰기 직전의 이 기기 데이터 { time, reason, data }
  };

  var _tokenClient = null;
  var _pending     = null;   // 진행 중인 토큰 요청 { resolve, reject }
  var _status      = 'local';
  var _message     = '';
  var _pushTimer   = null;
  var _busy        = false;
  var _again       = false;
  var _lastCheck   = 0;
  var _listeners   = [];

  /* ── localStorage 보조 ── */
  function _lsGet(k) { try { return localStorage.getItem(k); } catch(e) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, v); } catch(e) {} }
  function _lsDel(k) { try { localStorage.removeItem(k); } catch(e) {} }

  function isConfigured() { return !!CFG.GOOGLE_CLIENT_ID; }
  function getMode() { return _lsGet(LS.MODE); }
  function getEmail() { return _lsGet(LS.EMAIL) || ''; }
  function getLastSync() { return parseInt(_lsGet(LS.TIME) || '0', 10); }
  function getStatus() { return { status: _status, message: _message }; }

  function onStatus(fn) { _listeners.push(fn); }
  function _setStatus(s, msg) {
    _status  = s;
    _message = msg || '';
    _listeners.forEach(function(fn) { try { fn(_status, _message); } catch(e) {} });
  }

  /* ── 토큰 ── */
  function _validToken() {
    try {
      var o = JSON.parse(_lsGet(LS.TOKEN) || 'null');
      if (o && o.t && o.exp > Date.now()) return o.t;
    } catch(e) {}
    return null;
  }
  function _saveToken(resp) {
    var sec = parseInt(resp.expires_in || '3600', 10);
    _lsSet(LS.TOKEN, JSON.stringify({ t: resp.access_token, exp: Date.now() + (sec - 120) * 1000 }));
  }
  function _clearToken() { _lsDel(LS.TOKEN); }

  function _whenGis(timeoutMs) {
    return new Promise(function(resolve, reject) {
      var start = Date.now();
      (function wait() {
        if (window.google && google.accounts && google.accounts.oauth2) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다'));
        setTimeout(wait, 100);
      })();
    });
  }

  function _ensureTokenClient() {
    if (_tokenClient) return Promise.resolve(_tokenClient);
    return _whenGis(10000).then(function() {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CFG.GOOGLE_CLIENT_ID,
        scope    : SCOPE,
        callback : function(resp) {
          var p = _pending; _pending = null;
          if (!p) return;
          if (resp && resp.access_token) { _saveToken(resp); p.resolve(resp.access_token); }
          else p.reject(new Error((resp && (resp.error_description || resp.error)) || '인증 실패'));
        },
        error_callback: function(err) {
          var p = _pending; _pending = null;
          if (!p) return;
          var msg = (err && err.type === 'popup_closed') ? '로그인 창이 닫혔습니다'
                  : (err && err.type === 'popup_failed_to_open') ? '팝업이 차단되었습니다. 팝업을 허용해 주세요'
                  : '로그인에 실패했습니다';
          p.reject(new Error(msg));
        },
      });
      return _tokenClient;
    });
  }

  /* 반드시 사용자 클릭 이벤트 안에서 호출 (팝업 차단 방지) */
  function _requestToken(prompt) {
    return _ensureTokenClient().then(function(tc) {
      return new Promise(function(resolve, reject) {
        if (_pending) _pending.reject(new Error('새 로그인 요청으로 대체됨'));
        _pending = { resolve: resolve, reject: reject };
        var opts = { prompt: prompt };
        var hint = getEmail();
        if (hint) opts.login_hint = hint;
        tc.requestAccessToken(opts);
      });
    });
  }

  /* ── Drive REST ── */
  function _api(method, url, body, headers) {
    var tok = _validToken();
    if (!tok) return Promise.reject({ code: 'NO_TOKEN' });
    var h = { Authorization: 'Bearer ' + tok };
    for (var k in (headers || {})) h[k] = headers[k];
    var opts = { method: method, headers: h };
    if (body !== undefined) opts.body = body;
    return fetch(url, opts).then(function(r) {
      if (r.status === 401) { _clearToken(); throw { code: 'NO_TOKEN' }; }
      if (!r.ok) return r.text().then(function(t) { throw { code: 'HTTP', status: r.status, message: t }; });
      return r;
    });
  }

  function _q(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  function _findFile() {
    var cached = _lsGet(LS.FILE);
    if (cached) {
      return _api('GET', API + '/files/' + cached + '?fields=id,modifiedTime,trashed')
        .then(function(r) { return r.json(); })
        .then(function(f) {
          if (f.trashed) { _lsDel(LS.FILE); return _searchFile(); }
          return f;
        })
        .catch(function(e) {
          if (e && e.code === 'HTTP' && e.status === 404) { _lsDel(LS.FILE); return _searchFile(); }
          throw e;
        });
    }
    return _searchFile();
  }

  function _searchFile() {
    var q = "name='" + _q(FILE) + "' and trashed=false and mimeType='application/json'";
    var url = API + '/files?q=' + encodeURIComponent(q) +
              '&orderBy=modifiedTime desc&pageSize=1&fields=files(id,modifiedTime)&spaces=drive';
    return _api('GET', url).then(function(r) { return r.json(); }).then(function(res) {
      var f = (res.files || [])[0] || null;
      if (f) _lsSet(LS.FILE, f.id);
      return f;
    });
  }

  function _ensureFolder() {
    var q = "name='" + _q(FOLDER) + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    var url = API + '/files?q=' + encodeURIComponent(q) + '&pageSize=1&fields=files(id)&spaces=drive';
    return _api('GET', url).then(function(r) { return r.json(); }).then(function(res) {
      var f = (res.files || [])[0];
      if (f) return f.id;
      return _api('POST', API + '/files?fields=id',
        JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
        { 'Content-Type': 'application/json' }
      ).then(function(r) { return r.json(); }).then(function(nf) { return nf.id; });
    });
  }

  function _download(fileId) {
    return _api('GET', API + '/files/' + fileId + '?alt=media')
      .then(function(r) { return r.text(); })
      .then(function(txt) {
        var obj;
        try { obj = JSON.parse(txt); } catch(e) { obj = null; }
        if (!obj || obj.app !== 'myhome-dashboard' || !obj.data || typeof obj.data !== 'object') {
          throw { code: 'INVALID', message: 'Drive 파일 형식이 올바르지 않아 불러오지 않았습니다 (이 기기 데이터는 그대로)' };
        }
        return _clean(obj.data);
      });
  }

  /* 알려진 키 + 문자열 값만 통과 */
  function _clean(data) {
    var allowed = {}, out = {};
    for (var k in DashStorage.keys) allowed[DashStorage.keys[k]] = true;
    Object.keys(data || {}).forEach(function(key) {
      if (allowed[key] && typeof data[key] === 'string') out[key] = data[key];
    });
    return out;
  }

  function _payload(data) {
    return JSON.stringify({
      app    : 'myhome-dashboard',
      version: 1,
      savedAt: new Date().toISOString(),
      device : (navigator.platform || '') + ' / ' + (navigator.userAgent || '').slice(0, 80),
      data   : data,
    });
  }

  function _upload(data) {
    var body = _payload(data);
    var fileId = _lsGet(LS.FILE);
    if (fileId) {
      return _api('PATCH', UPLOAD + '/files/' + fileId + '?uploadType=media&fields=id,modifiedTime',
        body, { 'Content-Type': 'application/json' })
        .then(function(r) { return r.json(); });
    }
    return _ensureFolder().then(function(folderId) {
      var boundary = 'myhome' + Date.now();
      var meta = { name: FILE, mimeType: 'application/json', parents: [folderId] };
      var multipart =
        '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n' +
        '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n' +
        '--' + boundary + '--';
      return _api('POST', UPLOAD + '/files?uploadType=multipart&fields=id,modifiedTime',
        multipart, { 'Content-Type': 'multipart/related; boundary=' + boundary })
        .then(function(r) { return r.json(); })
        .then(function(f) { _lsSet(LS.FILE, f.id); return f; });
    });
  }

  /* ── 데이터 비교 ── */
  function _stable(data) {
    var keys = Object.keys(data || {}).sort();
    var out = {};
    keys.forEach(function(k) { out[k] = data[k]; });
    return JSON.stringify(out);
  }
  function _hash(data) {
    var s = _stable(data), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '_' + s.length;
  }

  function _markSynced(data, modifiedTime) {
    _lsSet(LS.HASH, _hash(data));
    _lsSet(LS.TIME, String(Date.now()));
    if (modifiedTime) _lsSet(LS.RTIME, modifiedTime);
    _setStatus('synced');
  }

  /* 덮어쓰기 직전 이 기기 데이터를 1건 보관 (설정 › 이전 데이터 복원) */
  function backupLocal(reason) {
    var local = DashStorage.exportAll();
    if (!Object.keys(local).length) return;
    try {
      localStorage.setItem(LS.BACKUP, JSON.stringify({ time: Date.now(), reason: reason || '', data: local }));
    } catch(e) { console.warn('backup 실패:', e); }
  }

  function getBackupInfo() {
    try {
      var b = JSON.parse(_lsGet(LS.BACKUP) || 'null');
      return b && b.data ? { time: b.time, reason: b.reason } : null;
    } catch(e) { return null; }
  }

  function restoreBackup() {
    var b;
    try { b = JSON.parse(_lsGet(LS.BACKUP) || 'null'); } catch(e) { b = null; }
    if (!b || !b.data) return false;
    var current = DashStorage.exportAll();
    DashStorage.replaceAll(_clean(b.data));
    _lsSet(LS.BACKUP, JSON.stringify({ time: Date.now(), reason: '복원 직전 데이터', data: current }));
    if (window.DashApp && DashApp.refresh) DashApp.refresh();
    schedulePush();
    return true;
  }

  function _applyRemote(data, modifiedTime) {
    var local = DashStorage.exportAll();
    if (!Object.keys(data).length && Object.keys(local).length) {
      if (!confirm('Drive 에 저장된 데이터가 비어 있습니다.\n\n[확인]  이 기기 데이터를 비웁니다\n[취소]  이 기기 데이터로 Drive 를 채웁니다 (권장)')) {
        return _upload(local).then(function(f) { _markSynced(local, f.modifiedTime); });
      }
    }
    if (_hash(local) !== _hash(data)) backupLocal('Drive 데이터로 덮어쓰기 전');
    DashStorage.replaceAll(data);
    _markSynced(DashStorage.exportAll(), modifiedTime);
    if (window.DashApp && DashApp.refresh) DashApp.refresh();
  }

  function _handleError(e) {
    if (e && e.code === 'NO_TOKEN') { _setStatus('reauth', 'Google 재연결이 필요합니다'); return; }
    if (e && e.code === 'INVALID')  { _setStatus('error', e.message); return; }
    if (!navigator.onLine) { _setStatus('offline', '오프라인 — 연결되면 다시 저장합니다'); return; }
    console.warn('DashSync error:', e);
    var msg = (e && e.status) ? 'Drive 오류 (' + e.status + ')' : (e && e.message) || 'Drive 동기화 오류';
    _setStatus('error', msg);
  }

  /* ── 동기화 본체 ── */
  function _push() {
    if (getMode() !== 'drive') return Promise.resolve();
    if (_busy) { _again = true; return Promise.resolve(); }
    var data = DashStorage.exportAll();
    if (_hash(data) === _lsGet(LS.HASH)) { _setStatus('synced'); return Promise.resolve(); }
    if (!_validToken()) { _setStatus('reauth', 'Google 재연결이 필요합니다'); return Promise.resolve(); }

    var fileId = _lsGet(LS.FILE);
    if (!fileId) return _initialSync();   // 파일 위치를 모르면 먼저 검색 (중복 생성 방지)

    _busy = true;
    _setStatus('syncing', 'Drive 에 저장 중...');
    var remoteChanged = false;
    /* 다른 기기가 그 사이 저장했으면 덮어쓰지 않고 비교 단계로 */
    return _api('GET', API + '/files/' + fileId + '?fields=modifiedTime,trashed')
      .then(function(r) { return r.json(); })
      .then(function(meta) {
        if (meta.trashed || meta.modifiedTime !== _lsGet(LS.RTIME)) { remoteChanged = true; return; }
        return _upload(data).then(function(f) { _markSynced(data, f.modifiedTime); });
      })
      .catch(function(e) {
        if (e && e.code === 'HTTP' && e.status === 404) { _lsDel(LS.FILE); remoteChanged = true; return; }
        _handleError(e);
      })
      .then(function() {
        _busy = false;
        if (remoteChanged) return _initialSync();
        if (_again) { _again = false; schedulePush(); }
      });
  }

  /* 로그인 직후/페이지 진입 시 — Drive 와 로컬을 맞춤 */
  function _initialSync() {
    if (_busy) return Promise.resolve();
    _busy = true;
    _setStatus('syncing', 'Drive 확인 중...');
    var local = DashStorage.exportAll();
    var localHash = _hash(local);
    var lastHash  = _lsGet(LS.HASH);

    return _findFile().then(function(file) {
      if (!file) {
        /* Drive 에 아직 데이터 없음 → 이 기기 데이터를 처음 업로드 */
        return _upload(local).then(function(f) { _markSynced(local, f.modifiedTime); });
      }
      return _download(file.id).then(function(remote) {
        var remoteHash = _hash(remote);
        if (remoteHash === localHash)          return _markSynced(local, file.modifiedTime);
        if (Object.keys(local).length === 0)   return _applyRemote(remote, file.modifiedTime);
        if (lastHash && localHash === lastHash) return _applyRemote(remote, file.modifiedTime); // 로컬 변경 없음
        if (lastHash && remoteHash === lastHash) {                                              // Drive 변경 없음
          return _upload(local).then(function(f) { _markSynced(local, f.modifiedTime); });
        }
        var msg = lastHash
          ? '이 기기에서 바뀐 내용과 Drive(다른 기기)에서 바뀐 내용이 서로 다릅니다.\n\n'
          : '이 기기에 기존 대시보드 데이터가 있고, Drive 에도 저장된 데이터가 있습니다.\n\n';
        msg += '[확인]  Drive 데이터를 불러옵니다 (이 기기 변경분은 버림)\n' +
               '[취소]  이 기기 데이터로 Drive 를 덮어씁니다';
        if (confirm(msg)) return _applyRemote(remote, file.modifiedTime);
        return _upload(local).then(function(f) { _markSynced(local, f.modifiedTime); });
      });
    })
    .catch(_handleError)
    .then(function() {
      _busy = false; _lastCheck = Date.now();
      if (_again) { _again = false; schedulePush(); }
    });
  }

  /* 탭으로 돌아왔을 때 다른 기기에서 바뀌었는지 가볍게 확인 */
  function _checkRemote() {
    if (getMode() !== 'drive' || _busy || !_validToken()) return;
    if (Date.now() - _lastCheck < CHECK_GAP) return;
    _lastCheck = Date.now();
    var fileId = _lsGet(LS.FILE);
    if (!fileId) return;
    _api('GET', API + '/files/' + fileId + '?fields=modifiedTime')
      .then(function(r) { return r.json(); })
      .then(function(f) {
        if (f.modifiedTime && f.modifiedTime !== _lsGet(LS.RTIME)) return _initialSync();
      })
      .catch(_handleError);
  }

  function _fetchEmail() {
    return _api('GET', API + '/about?fields=user(emailAddress)')
      .then(function(r) { return r.json(); })
      .then(function(a) { if (a.user && a.user.emailAddress) _lsSet(LS.EMAIL, a.user.emailAddress); })
      .catch(function() {});
  }

  /* ── 공개 API ── */
  function schedulePush() {
    if (getMode() !== 'drive') return;
    clearTimeout(_pushTimer);
    if (_status !== 'reauth') _setStatus('pending', '변경 사항 저장 대기...');
    _pushTimer = setTimeout(_push, PUSH_DELAY);
  }

  /* 사용자 클릭에서 호출: 최초 로그인(계정 선택) */
  function signIn() {
    if (!isConfigured()) return Promise.reject(new Error('config.js 에 GOOGLE_CLIENT_ID 가 설정되지 않았습니다'));
    _setStatus('syncing', 'Google 로그인 중...');
    var prompt = getEmail() ? '' : 'select_account';
    return _requestToken(prompt).then(function() {
      _lsSet(LS.MODE, 'drive');
      return _fetchEmail();
    }).then(_initialSync).catch(function(e) {
      if (getMode() === 'drive') _setStatus('reauth', e.message);
      else _setStatus('local', e.message);
      throw e;
    });
  }

  function useLocalOnly() {
    _lsSet(LS.MODE, 'local');
    _setStatus('local');
  }

  /* Drive 파일이 손상됐을 때 등 — 이 기기 데이터로 Drive 를 덮어씀 (Drive 는 이전 버전을 보관) */
  function pushForce() {
    if (!_validToken()) return signIn();
    var data = DashStorage.exportAll();
    _busy = true;
    _setStatus('syncing', 'Drive 에 덮어쓰는 중...');
    return _upload(data)
      .then(function(f) { _markSynced(data, f.modifiedTime); })
      .catch(_handleError)
      .then(function() { _busy = false; });
  }

  function signOut(wipeLocal) {
    var tok = _validToken();
    if (tok && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(tok, function() {}); } catch(e) {}
    }
    _clearToken();
    [LS.EMAIL, LS.FILE, LS.HASH, LS.TIME, LS.RTIME].forEach(_lsDel);
    clearTimeout(_pushTimer); _pushTimer = null;
    _lsSet(LS.MODE, 'local');
    if (wipeLocal) {
      DashStorage.replaceAll({});
      _lsDel(LS.BACKUP);
      _lsDel('mydash_weather_cache');
      if (window.DashApp && DashApp.refresh) DashApp.refresh();
      _setStatus('local', '로그아웃하고 이 기기의 데이터를 삭제했습니다 (Drive 데이터는 남아 있습니다)');
    } else {
      _setStatus('local', '로그아웃했습니다 (이 기기의 데이터는 남아 있습니다)');
    }
  }

  function syncNow() {
    if (getMode() !== 'drive') return Promise.resolve();
    if (!_validToken()) return signIn();
    _lsDel(LS.RTIME);
    return _initialSync();
  }

  function pullFromDrive() {
    if (!_validToken()) return signIn();
    _busy = true;
    _setStatus('syncing', 'Drive 에서 불러오는 중...');
    return _findFile().then(function(file) {
      if (!file) { _setStatus('synced', 'Drive 에 저장된 데이터가 없습니다'); return; }
      return _download(file.id).then(function(remote) { _applyRemote(remote, file.modifiedTime); });
    }).catch(_handleError).then(function() { _busy = false; });
  }

  /* 앱 시작 시 호출 — 로그인 필요 여부를 반환 */
  function init() {
    DashStorage.onChange(schedulePush);

    var mode = getMode();
    if (mode === 'drive') {
      if (_validToken()) {
        _initialSync();
      } else {
        _setStatus('reauth', 'Google 재연결이 필요합니다');
      }
      if (isConfigured()) _ensureTokenClient().catch(function() {});
    } else {
      _setStatus('local');
    }

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') _checkRemote();
      else if (getMode() === 'drive' && _pushTimer) {
        /* 탭을 떠날 때 대기 중인 변경을 바로 저장 (Drive 변경 여부 확인 포함).
           창을 닫아 중단돼도 데이터는 이 기기에 남아 다음 접속 때 올라감 */
        clearTimeout(_pushTimer); _pushTimer = null;
        _push();
      }
    });
    window.addEventListener('online', function() {
      if (getMode() === 'drive' && _validToken()) _push();
    });

    return !mode;   // true → 첫 방문: 로그인 안내 표시
  }

  return {
    init, signIn, signOut, useLocalOnly, syncNow, pullFromDrive, pushForce, schedulePush,
    backupLocal, getBackupInfo, restoreBackup,
    onStatus, getStatus, getMode, getEmail, getLastSync, isConfigured,
  };
})();
