/* ========================================
   bookmarks.js — 즐겨찾기 위젯
   - 그룹 색상 픽커
   - 링크 편집 모달
   - 링크 드래그 순서 변경 + 그룹 간 이동 (mouse 이벤트 기반)
   - 그룹 순서 드래그 변경
   - 그룹 이름 인라인 편집
   ======================================== */
const BookmarksWidget = (() => {

  var GROUP_COLORS = [
    '#5c7cfa','#f03e3e','#20c997','#fd7e14','#cc5de8','#e64980',
    '#74c0fc','#ffd43b','#a9e34b','#66d9e8',
  ];

  var _modal = null;

  /* ── 드래그 상태 (모듈 스코프) ── */
  var _ms = {
    active     : false,
    type       : null,   /* 'link' | 'group' */
    linkId     : null,
    srcGrpId   : null,
    grpId      : null,
    ghost      : null,
    sourceEl   : null,
    containerId: null,
    overWrap   : null,
    overZone   : null,
    overGrp    : null,
    overPos    : null,   /* 'top' | 'bot' */
  };

  /* ── document 레벨 mousedown (캡처 단계, 1회만 등록) ── */
  var _docMousedownBound = false;

  function _ensureDocMousedown() {
    if (_docMousedownBound) return;
    _docMousedownBound = true;

    document.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;

      /* 링크 드래그: .bookmark-link-wrap 위에서 마우스다운 */
      var wrap = e.target.closest('.bookmark-link-wrap');
      if (wrap && !e.target.closest('.bm-link-actions')) {
        /* 어느 위젯에 속해 있는지 알아내기 */
        var body = e.target.closest('.bookmarks-widget') &&
                   e.target.closest('[id$="_body"]');
        /* containerId: body 엘리먼트 id에서 "_body" 제거 */
        var cid = _getContainerIdFromElement(wrap);
        if (!cid) return;
        e.preventDefault();
        _startDrag(e, 'link', wrap.dataset.linkId, wrap.dataset.grpId, null, cid, wrap);
        return;
      }

      /* 그룹 핸들 드래그 */
      var handle = e.target.closest('.bm-grp-drag-handle');
      if (handle) {
        var cid2 = _getContainerIdFromElement(handle);
        if (!cid2) return;
        e.preventDefault();
        var grpEl = handle.closest('.bookmark-group');
        _startDrag(e, 'group', null, null, handle.dataset.grpId, cid2, grpEl);
        return;
      }
    }, true); /* capture 단계 — Gridstack 보다 먼저 실행 */
  }

  /* 요소로부터 containerId 찾기 */
  function _getContainerIdFromElement(el) {
    var body = el.closest('[id$="_body"]');
    if (!body) return null;
    /* id = "bookmarks_XXXXX_body" → containerId = "bookmarks_XXXXX" */
    return body.id.replace(/_body$/, '');
  }

  /* ── 렌더 ── */
  function render(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    _ensureDocMousedown();
    _draw(containerId);
  }

  function _draw(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var groups = DashStorage.loadBookmarks();

    var groupsHtml = groups.map(function(grp) {
      return _renderGroup(grp, containerId);
    }).join('');

    el.innerHTML =
      '<div class="widget bookmarks-widget">' +
        '<div class="widget-header">' +
          '<span class="widget-title"><span class="icon">🔖</span> 즐겨찾기</span>' +
          '<div class="widget-actions">' +
            '<button class="widget-action-btn" id="' + containerId + '_addgrp" title="그룹 추가">＋</button>' +
            '<button class="widget-action-btn danger" onclick="DashGrid.removeWidget(\'' + containerId + '\')" title="삭제">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="widget-body" id="' + containerId + '_body">' +
          groupsHtml +
        '</div>' +
      '</div>';

    document.getElementById(containerId + '_addgrp').addEventListener('click', function() {
      _showGroupModal(containerId, null);
    });

    _bindClickEvents(containerId);
    _ensureModal();
  }

  /* ── 그룹 렌더 ── */
  function _renderGroup(grp, containerId) {
    var gid = _escAttr(grp.id);
    var linksHtml = (Array.isArray(grp.links) ? grp.links : []).map(function(link, idx) {
      return _renderLink(link, grp.id, idx);
    }).join('');

    return '<div class="bookmark-group" data-grp-id="' + gid + '">' +
      '<div class="bookmark-group-header">' +
        '<div class="bm-grp-drag-handle" data-grp-id="' + gid + '" title="드래그하여 그룹 순서 변경">⠿</div>' +
        '<div class="bookmark-group-color" style="background:' + _safeColor(grp.color) + '" data-action="edit-grp" data-grp-id="' + gid + '"></div>' +
        '<span class="bookmark-group-name" data-action="rename-grp" data-grp-id="' + gid + '">' + _esc(grp.name) + '</span>' +
        '<button class="widget-action-btn danger" data-action="del-grp" data-grp-id="' + gid + '" title="그룹 삭제">✕</button>' +
      '</div>' +
      '<div class="bookmark-links" data-grp-id="' + gid + '" id="bm-links-' + gid + '">' +
        linksHtml +
        '<button class="bookmark-add-link" data-action="add-link" data-grp-id="' + gid + '" title="링크 추가">＋ 추가</button>' +
      '</div>' +
      '<div class="bookmark-add-form" id="bm-form-' + gid + '">' +
        '<input type="text" placeholder="이름" class="bm-input-name">' +
        '<input type="text" placeholder="URL (https://...)" class="bm-input-url">' +
        '<div class="bookmark-add-form-actions">' +
          '<button class="btn btn-sm btn-primary" data-action="save-link" data-grp-id="' + gid + '">추가</button>' +
          '<button class="btn btn-sm btn-secondary" data-action="cancel-link" data-grp-id="' + gid + '">취소</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ── 링크 렌더 ── */
  function _renderLink(link, grpId, idx) {
    var icon = _safeUrl(link.icon, /^https?:\/\//i);
    var faviconEl = icon
      ? '<img src="' + _escAttr(icon) + '" draggable="false" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'inline\'">' +
        '<span style="display:none">🔗</span>'
      : '<span>🔗</span>';
    var lid = _escAttr(link.id);
    grpId = _escAttr(grpId);

    return '<div class="bookmark-link-wrap" data-link-id="' + lid + '" data-grp-id="' + grpId + '" data-idx="' + parseInt(idx, 10) + '">' +
      '<a class="bookmark-link" href="' + _escAttr(_safeUrl(link.url, /^(https?:|mailto:)/i) || '#') + '" target="_blank" rel="noopener noreferrer" draggable="false">' +
        '<div class="bookmark-favicon">' + faviconEl + '</div>' +
        '<div class="bookmark-name">' + _esc(link.name) + '</div>' +
      '</a>' +
      '<div class="bm-link-actions">' +
        '<button class="bm-icon-btn" data-action="edit-link" data-link-id="' + lid + '" data-grp-id="' + grpId + '" title="편집">✎</button>' +
        '<button class="bm-icon-btn danger" data-action="del-link" data-link-id="' + lid + '" data-grp-id="' + grpId + '" title="삭제">✕</button>' +
      '</div>' +
    '</div>';
  }

  /* ── 클릭 이벤트만 위임 (_draw 호출시마다 재등록 OK) ── */
  function _bindClickEvents(containerId) {
    var body = document.getElementById(containerId + '_body');
    if (!body) return;

    body.addEventListener('click', function(e) {
      /* 드래그 직후 click 무시 */
      if (_ms._justDropped) { _ms._justDropped = false; return; }
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var action = el.dataset.action;

      if (action === 'add-link') {
        e.preventDefault();
        var form = document.getElementById('bm-form-' + el.dataset.grpId);
        if (form) {
          form.classList.toggle('show');
          if (form.classList.contains('show')) {
            var ni = form.querySelector('.bm-input-name');
            if (ni) ni.focus();
          }
        }
      } else if (action === 'save-link') {
        e.preventDefault();
        _saveLink(containerId, el.dataset.grpId);
      } else if (action === 'cancel-link') {
        e.preventDefault();
        var form2 = document.getElementById('bm-form-' + el.dataset.grpId);
        if (form2) form2.classList.remove('show');
      } else if (action === 'del-link') {
        e.preventDefault();
        if (confirm('링크를 삭제하시겠습니까?')) {
          _deleteLink(containerId, el.dataset.grpId, el.dataset.linkId);
        }
      } else if (action === 'edit-link') {
        e.preventDefault();
        _showLinkModal(containerId, el.dataset.grpId, el.dataset.linkId);
      } else if (action === 'del-grp') {
        e.preventDefault();
        if (confirm('그룹을 삭제하시겠습니까?')) _deleteGroup(containerId, el.dataset.grpId);
      } else if (action === 'edit-grp') {
        e.preventDefault();
        _showGroupModal(containerId, el.dataset.grpId);
      } else if (action === 'rename-grp') {
        e.preventDefault();
        _inlineRenameGroup(containerId, el, el.dataset.grpId);
      }
    });

    /* Enter key in add-form */
    body.querySelectorAll('.bookmark-add-form').forEach(function(form) {
      var urlInp = form.querySelector('.bm-input-url');
      if (urlInp) {
        urlInp.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            var grpId = form.querySelector('[data-action="save-link"]').dataset.grpId;
            _saveLink(containerId, grpId);
          }
        });
      }
    });
  }

  /* ── 드래그 시작 ── */
  function _startDrag(e, type, linkId, srcGrpId, grpId, containerId, sourceEl) {
    _ms.active      = true;
    _ms.type        = type;
    _ms.linkId      = linkId;
    _ms.srcGrpId    = srcGrpId;
    _ms.grpId       = grpId;
    _ms.containerId = containerId;
    _ms.overWrap    = null;
    _ms.overZone    = null;
    _ms.overGrp     = null;
    _ms.overPos     = null;
    _ms._justDropped = false;

    /* ghost 생성 */
    var ghost = document.createElement('div');
    ghost.className = 'bm-drag-ghost';
    var nameEl = sourceEl.querySelector('.bookmark-name') || sourceEl.querySelector('.bookmark-group-name');
    ghost.textContent = nameEl ? nameEl.textContent : (type === 'link' ? '링크' : '그룹');
    ghost.style.cssText = [
      'position:fixed',
      'z-index:99999',
      'pointer-events:none',
      'padding:4px 10px',
      'background:var(--accent,#5c7cfa)',
      'color:#fff',
      'border-radius:6px',
      'font-size:12px',
      'white-space:nowrap',
      'box-shadow:0 4px 12px rgba(0,0,0,0.4)',
      'opacity:0.9',
      'left:' + (e.clientX + 12) + 'px',
      'top:'  + (e.clientY + 8)  + 'px',
    ].join(';');
    document.body.appendChild(ghost);
    _ms.ghost = ghost;

    sourceEl.classList.add('bm-dragging');
    _ms.sourceEl = sourceEl;

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
  }

  /* ── 드래그 이동 ── */
  function _onMouseMove(e) {
    if (!_ms.active) return;

    _ms.ghost.style.left = (e.clientX + 12) + 'px';
    _ms.ghost.style.top  = (e.clientY + 8)  + 'px';

    var body = document.getElementById(_ms.containerId + '_body');
    if (!body) return;

    /* 하이라이트 초기화 */
    body.querySelectorAll('.bm-drag-over').forEach(function(el) { el.classList.remove('bm-drag-over'); });
    body.querySelectorAll('.bm-links-drag-over').forEach(function(el) { el.classList.remove('bm-links-drag-over'); });
    body.querySelectorAll('.bm-grp-drag-over-top,.bm-grp-drag-over-bot').forEach(function(el) {
      el.classList.remove('bm-grp-drag-over-top', 'bm-grp-drag-over-bot');
    });
    _ms.overWrap = null;
    _ms.overZone = null;
    _ms.overGrp  = null;
    _ms.overPos  = null;

    /* ghost 를 잠깐 숨겨 elementFromPoint 정확도 확보 */
    _ms.ghost.style.display = 'none';
    var target = document.elementFromPoint(e.clientX, e.clientY);
    _ms.ghost.style.display = '';
    if (!target) return;

    if (_ms.type === 'link') {
      var overWrap = target.closest('.bookmark-link-wrap');
      if (overWrap && overWrap.dataset.linkId !== _ms.linkId) {
        overWrap.classList.add('bm-drag-over');
        _ms.overWrap = overWrap;
        return;
      }
      var overZone = target.closest('.bookmark-links');
      if (overZone) {
        overZone.classList.add('bm-links-drag-over');
        _ms.overZone = overZone;
        return;
      }
    }

    if (_ms.type === 'group') {
      var overGrp = target.closest('.bookmark-group');
      if (overGrp && overGrp.dataset.grpId !== _ms.grpId) {
        var rect = overGrp.getBoundingClientRect();
        var pos  = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bot';
        overGrp.classList.add(pos === 'top' ? 'bm-grp-drag-over-top' : 'bm-grp-drag-over-bot');
        _ms.overGrp = overGrp;
        _ms.overPos = pos;
      }
    }
  }

  /* ── 드래그 끝 ── */
  function _onMouseUp(e) {
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup',   _onMouseUp);

    if (!_ms.active) return;

    if (_ms.ghost) { _ms.ghost.remove(); _ms.ghost = null; }
    if (_ms.sourceEl) { _ms.sourceEl.classList.remove('bm-dragging'); _ms.sourceEl = null; }

    var body = document.getElementById(_ms.containerId + '_body');
    if (body) {
      body.querySelectorAll('.bm-drag-over,.bm-links-drag-over,.bm-grp-drag-over-top,.bm-grp-drag-over-bot')
        .forEach(function(el) {
          el.classList.remove('bm-drag-over','bm-links-drag-over','bm-grp-drag-over-top','bm-grp-drag-over-bot');
        });
    }

    var cid       = _ms.containerId;
    var didDrop   = false;

    if (_ms.type === 'link') {
      if (_ms.overWrap) {
        _reorderLinks(cid, _ms.srcGrpId, _ms.linkId, _ms.overWrap.dataset.grpId, _ms.overWrap.dataset.linkId);
        didDrop = true;
      } else if (_ms.overZone) {
        var dstGrpId = _ms.overZone.dataset.grpId;
        if (dstGrpId !== _ms.srcGrpId) {
          _reorderLinks(cid, _ms.srcGrpId, _ms.linkId, dstGrpId, null);
          didDrop = true;
        }
      }
    }

    if (_ms.type === 'group' && _ms.overGrp) {
      _reorderGroups(cid, _ms.grpId, _ms.overGrp.dataset.grpId, _ms.overPos === 'top');
      didDrop = true;
    }

    /* 드롭이 발생했으면 click 이벤트 억제 */
    if (didDrop) _ms._justDropped = true;

    _ms.active = false;
    _ms.type   = null;
  }

  /* ── 인라인 그룹 이름 변경 ── */
  function _inlineRenameGroup(containerId, span, grpId) {
    var current = span.textContent;
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = current;
    inp.className = 'bm-inline-input';
    span.replaceWith(inp);
    inp.focus();
    inp.select();

    function commit() {
      var name = inp.value.trim() || current;
      var groups = DashStorage.loadBookmarks();
      var grp = _findGroup(groups, grpId);
      if (grp) { grp.name = name; DashStorage.saveBookmarks(groups); }
      _draw(containerId);
    }
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') inp.blur();
      if (e.key === 'Escape') { inp.value = current; inp.blur(); }
    });
  }

  /* ── 링크 저장 ── */
  function _saveLink(containerId, grpId) {
    var form = document.getElementById('bm-form-' + grpId);
    if (!form) return;
    var nameInp = form.querySelector('.bm-input-name');
    var urlInp  = form.querySelector('.bm-input-url');
    var name = nameInp.value.trim();
    var url  = urlInp.value.trim();
    if (!name || !url) { alert('이름과 URL을 입력하세요.'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    var domain = '';
    try { domain = new URL(url).hostname; } catch(e) {}
    var icon = domain ? 'https://' + domain + '/favicon.ico' : '';

    var groups = DashStorage.loadBookmarks();
    var grp = _findGroup(groups, grpId);
    if (!grp) return;
    grp.links.push({ id: 'lnk_' + Date.now(), name: name, url: url, icon: icon });
    DashStorage.saveBookmarks(groups);
    _draw(containerId);
  }

  /* ── 링크 삭제 ── */
  function _deleteLink(containerId, grpId, linkId) {
    var groups = DashStorage.loadBookmarks();
    var grp = _findGroup(groups, grpId);
    if (!grp) return;
    grp.links = grp.links.filter(function(l) { return l.id !== linkId; });
    DashStorage.saveBookmarks(groups);
    _draw(containerId);
  }

  /* ── 링크 재정렬 (그룹 간 이동 포함) ── */
  function _reorderLinks(containerId, srcGrpId, srcLinkId, dstGrpId, dstLinkId) {
    var groups = DashStorage.loadBookmarks();
    var srcGrp = _findGroup(groups, srcGrpId);
    var dstGrp = _findGroup(groups, dstGrpId);
    if (!srcGrp || !dstGrp) return;

    var srcIdx = -1;
    for (var i = 0; i < srcGrp.links.length; i++) {
      if (srcGrp.links[i].id === srcLinkId) { srcIdx = i; break; }
    }
    if (srcIdx === -1) return;

    var link = srcGrp.links.splice(srcIdx, 1)[0];

    var dstIdx = -1;
    if (dstLinkId) {
      for (var j = 0; j < dstGrp.links.length; j++) {
        if (dstGrp.links[j].id === dstLinkId) { dstIdx = j; break; }
      }
    }
    if (dstIdx === -1) dstIdx = dstGrp.links.length;
    dstGrp.links.splice(dstIdx, 0, link);

    DashStorage.saveBookmarks(groups);
    _draw(containerId);
  }

  /* ── 그룹 재정렬 ── */
  function _reorderGroups(containerId, srcGrpId, dstGrpId, insertBefore) {
    var groups = DashStorage.loadBookmarks();
    var srcIdx = -1;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === srcGrpId) { srcIdx = i; break; }
    }
    if (srcIdx === -1) return;

    var moved = groups.splice(srcIdx, 1)[0];

    var dstIdx = -1;
    for (var j = 0; j < groups.length; j++) {
      if (groups[j].id === dstGrpId) { dstIdx = j; break; }
    }
    if (dstIdx === -1) return;

    var insertAt = insertBefore ? dstIdx : dstIdx + 1;
    groups.splice(insertAt, 0, moved);
    DashStorage.saveBookmarks(groups);
    _draw(containerId);
  }

  /* ── 그룹 삭제 ── */
  function _deleteGroup(containerId, grpId) {
    var groups = DashStorage.loadBookmarks().filter(function(g) { return g.id !== grpId; });
    DashStorage.saveBookmarks(groups);
    _draw(containerId);
  }

  /* ── 그룹 모달 ── */
  function _showGroupModal(containerId, grpId) {
    var groups = DashStorage.loadBookmarks();
    var grp = grpId ? _findGroup(groups, grpId) : null;
    var isNew = !grp;

    var currentColor = grp ? grp.color : GROUP_COLORS[0];
    var currentName  = grp ? grp.name  : '';

    var colorSwatches = GROUP_COLORS.map(function(c) {
      var active = c === currentColor ? ' bm-swatch-active' : '';
      return '<button class="bm-swatch' + active + '" style="background:' + c + '" data-color="' + c + '"></button>';
    }).join('');

    _showModal(
      isNew ? '그룹 추가' : '그룹 편집',
      '<div class="bm-modal-field">' +
        '<label>그룹 이름</label>' +
        '<input type="text" id="bm_modal_name" class="settings-input" value="' + _escAttr(currentName) + '" placeholder="그룹 이름 입력" maxlength="30">' +
      '</div>' +
      '<div class="bm-modal-field">' +
        '<label>색상</label>' +
        '<div class="bm-swatch-row" id="bm_modal_swatches">' + colorSwatches + '</div>' +
      '</div>',
      '저장',
      function() {
        var nameEl  = document.getElementById('bm_modal_name');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { alert('그룹 이름을 입력하세요.'); return false; }

        var activeEl = document.querySelector('#bm_modal_swatches .bm-swatch-active');
        var color = activeEl ? activeEl.dataset.color : GROUP_COLORS[0];

        var groups2 = DashStorage.loadBookmarks();
        if (isNew) {
          groups2.push({ id: 'grp_' + Date.now(), name: name, color: color, links: [] });
        } else {
          var g = _findGroup(groups2, grpId);
          if (g) { g.name = name; g.color = color; }
        }
        DashStorage.saveBookmarks(groups2);
        _draw(containerId);
        return true;
      }
    );

    setTimeout(function() {
      var swatches = document.getElementById('bm_modal_swatches');
      if (!swatches) return;
      swatches.addEventListener('click', function(e) {
        var btn = e.target.closest('.bm-swatch');
        if (!btn) return;
        swatches.querySelectorAll('.bm-swatch').forEach(function(s) { s.classList.remove('bm-swatch-active'); });
        btn.classList.add('bm-swatch-active');
      });
      var ni = document.getElementById('bm_modal_name');
      if (ni) ni.focus();
    }, 50);
  }

  /* ── 링크 편집 모달 ── */
  function _showLinkModal(containerId, grpId, linkId) {
    var groups = DashStorage.loadBookmarks();
    var grp = _findGroup(groups, grpId);
    if (!grp) return;
    var link = null;
    for (var i = 0; i < grp.links.length; i++) {
      if (grp.links[i].id === linkId) { link = grp.links[i]; break; }
    }
    if (!link) return;

    _showModal(
      '링크 편집',
      '<div class="bm-modal-field">' +
        '<label>이름</label>' +
        '<input type="text" id="bm_link_name" class="settings-input" value="' + _escAttr(link.name) + '" maxlength="50">' +
      '</div>' +
      '<div class="bm-modal-field">' +
        '<label>URL</label>' +
        '<input type="text" id="bm_link_url" class="settings-input" value="' + _escAttr(link.url) + '" placeholder="https://">' +
      '</div>',
      '저장',
      function() {
        var nameEl = document.getElementById('bm_link_name');
        var urlEl  = document.getElementById('bm_link_url');
        var name = nameEl ? nameEl.value.trim() : '';
        var url  = urlEl  ? urlEl.value.trim()  : '';
        if (!name || !url) { alert('이름과 URL을 입력하세요.'); return false; }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        var domain = '';
        try { domain = new URL(url).hostname; } catch(e) {}

        var groups2 = DashStorage.loadBookmarks();
        var grp2 = _findGroup(groups2, grpId);
        if (!grp2) return true;
        for (var j = 0; j < grp2.links.length; j++) {
          if (grp2.links[j].id === linkId) {
            grp2.links[j].name = name;
            grp2.links[j].url  = url;
            grp2.links[j].icon = domain ? 'https://' + domain + '/favicon.ico' : '';
            break;
          }
        }
        DashStorage.saveBookmarks(groups2);
        _draw(containerId);
        return true;
      }
    );

    setTimeout(function() {
      var ni = document.getElementById('bm_link_name');
      if (ni) ni.focus();
    }, 50);
  }

  /* ── 공통 모달 ── */
  function _ensureModal() {
    if (document.getElementById('bmGlobalModal')) return;
    var div = document.createElement('div');
    div.id = 'bmGlobalModal';
    div.className = 'bm-modal-overlay';
    div.style.display = 'none';
    div.innerHTML =
      '<div class="bm-modal-box">' +
        '<div class="bm-modal-header">' +
          '<span id="bmModalTitle"></span>' +
          '<button id="bmModalClose" class="bm-modal-close">✕</button>' +
        '</div>' +
        '<div class="bm-modal-body" id="bmModalBody"></div>' +
        '<div class="bm-modal-footer">' +
          '<button class="btn btn-sm btn-secondary" id="bmModalCancel">취소</button>' +
          '<button class="btn btn-sm btn-primary" id="bmModalOk"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);
    _modal = div;

    document.getElementById('bmModalClose').addEventListener('click', _hideModal);
    document.getElementById('bmModalCancel').addEventListener('click', _hideModal);
    div.addEventListener('click', function(e) { if (e.target === div) _hideModal(); });
  }

  function _showModal(title, bodyHtml, okLabel, onOk) {
    _ensureModal();
    document.getElementById('bmModalTitle').textContent = title;
    document.getElementById('bmModalBody').innerHTML = bodyHtml;
    document.getElementById('bmModalOk').textContent = okLabel;

    var okBtn = document.getElementById('bmModalOk');
    var newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    newOk.addEventListener('click', function() {
      if (onOk() !== false) _hideModal();
    });

    document.getElementById('bmGlobalModal').style.display = 'flex';
  }

  function _hideModal() {
    var m = document.getElementById('bmGlobalModal');
    if (m) m.style.display = 'none';
  }

  /* ── 유틸 ── */
  function _findGroup(groups, grpId) {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].id === grpId) return groups[i];
    }
    return null;
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  /* javascript: 등 위험한 스킴 차단 */
  function _safeUrl(u, allow) {
    u = String(u == null ? '' : u).trim();
    return allow.test(u) ? u : '';
  }
  function _safeColor(c) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : '#5c7cfa';
  }

  function defaultConfig() {
    return { id: 'bookmarks_' + Date.now(), type: 'bookmarks', x: 0, y: 0, w: 6, h: 4 };
  }

  return { render, defaultConfig };
})();
