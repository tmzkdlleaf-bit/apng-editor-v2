import { applyCommand, invertPatches, applyPatches } from './commands.js';

const HISTORY_LIMIT = 200;
const MERGE_WINDOW_MS = 500;

function _mergeKey(cmd) {
  if (cmd.type === 'setProp')  return `setProp:${cmd.id}:${cmd.path}`;
  if (cmd.type === 'setMeta')  return `setMeta:${Object.keys(cmd.patch).sort().join(',')}`;
  if (cmd.type === 'setLayer') return `setLayer:${cmd.id}:${Object.keys(cmd.patch).sort().join(',')}`;
  return null;
}

function _notifFromPatches(patches, source) {
  const n = { layers: new Set(), keys: new Set(), meta: false, order: false, source };
  for (const p of patches) {
    const [root, second, third] = p.path;
    if (root === 'layers' && second) {
      n.layers.add(second);
      if (third !== undefined) {
        if (third === 'childOrder') n.order = true;
        else n.keys.add(third);
      }
    } else if (root === 'meta') {
      n.meta = true;
      if (p.path[1]) n.keys.add(p.path[1]);
    } else if (root === 'order') {
      n.order = true;
    } else if (root === 'camera') {
      n.meta = true;
    }
  }
  return n;
}

function _matches(scope, notif) {
  if (scope.any)    return true;
  if (scope.meta    && notif.meta) return true;
  if (scope.layers  && (notif.layers.size > 0 || notif.order)) return true;
  if (scope.layer   && notif.layers.has(scope.layer)) return true;
  return false;
}

export function createStore(initDoc) {
  let _doc = structuredClone(initDoc);

  const _undo = [];
  const _redo = [];

  let _batch = null;  // { label, patches, selectionSnapshot }

  // _seq: apply마다 단조 증가. subscribe 시 현재 seq를 기록해
  // 구독 이전의 notif(seq <= subSeq)는 전달하지 않는다.
  let _seq = 0;
  const _subs = [];         // { scope, fn, seq }
  const _queue = [];        // { seq, notif } — 아직 전달 안 된 notif 목록
  let _scheduled = false;

  function _scheduleNotif(notif) {
    _seq++;
    _queue.push({ seq: _seq, notif });
    if (!_scheduled) {
      _scheduled = true;
      queueMicrotask(() => {
        const items = _queue.splice(0);
        _scheduled = false;
        for (const { scope, fn, seq: subSeq } of [..._subs]) {
          const combined = { layers: new Set(), keys: new Set(), meta: false, order: false, source: 'apply' };
          let any = false;
          for (const { seq, notif: n } of items) {
            if (seq <= subSeq) continue;
            for (const id of n.layers) combined.layers.add(id);
            for (const k of n.keys)   combined.keys.add(k);
            if (n.meta)  combined.meta  = true;
            if (n.order) combined.order = true;
            combined.source = n.source;
            any = true;
          }
          if (any && _matches(scope, combined)) fn(combined);
        }
      });
    }
  }

  function get() { return _doc; }

  function apply(cmd, opts = {}) {
    if (_batch) throw new Error('begin 중에는 apply를 호출할 수 없습니다');
    const { merge = false, selectionSnapshot = null } = opts;
    const patches = applyCommand(_doc, cmd);
    if (!patches.length) return patches;

    const invPatches = invertPatches(patches);
    const ts = Date.now();
    const mk = merge ? _mergeKey(cmd) : null;
    const last = _undo[_undo.length - 1];
    // redo 기록이 있으면 merge하지 않음
    const canMerge = mk && last && last.mergeKey === mk
      && (ts - last.timestamp) < MERGE_WINDOW_MS
      && _redo.length === 0;

    if (canMerge) {
      _undo[_undo.length - 1] = {
        ...last,
        patches: [...last.patches, ...patches],
        invPatches: [...invPatches, ...last.invPatches],
        timestamp: ts,
        selectionSnapshot: selectionSnapshot ?? last.selectionSnapshot,
      };
    } else {
      _redo.length = 0;
      _undo.push({ patches, invPatches, label: cmd.type, mergeKey: mk, timestamp: ts, selectionSnapshot });
      if (_undo.length > HISTORY_LIMIT) _undo.shift();
    }

    _scheduleNotif(_notifFromPatches(patches, 'apply'));
    return patches;
  }

  function begin(label = '', { selectionSnapshot = null } = {}) {
    if (_batch) throw new Error('이미 begin 진행 중입니다');
    _batch = { label, patches: [], selectionSnapshot };
  }

  function preview(cmd) {
    if (!_batch) throw new Error('preview는 begin/commit 사이에서만 쓸 수 있습니다');
    const patches = applyCommand(_doc, cmd);
    _batch.patches.push(...patches);
    _scheduleNotif(_notifFromPatches(patches, 'preview'));
    return patches;
  }

  function commit() {
    if (!_batch) return;
    const { patches, label, selectionSnapshot } = _batch;
    _batch = null;
    if (!patches.length) return;
    const invPatches = invertPatches(patches);
    _redo.length = 0;
    _undo.push({ patches, invPatches, label, mergeKey: null, timestamp: Date.now(), selectionSnapshot });
    if (_undo.length > HISTORY_LIMIT) _undo.shift();
  }

  function cancel() {
    if (!_batch) return;
    const { patches } = _batch;
    _batch = null;
    if (!patches.length) return;
    applyPatches(_doc, invertPatches(patches));
    _scheduleNotif(_notifFromPatches(patches, 'cancel'));
  }

  function undo() {
    if (!_undo.length) return null;
    const entry = _undo.pop();
    applyPatches(_doc, entry.invPatches);
    _redo.push(entry);
    _scheduleNotif(_notifFromPatches(entry.invPatches, 'undo'));
    return { selectionSnapshot: entry.selectionSnapshot ?? null };
  }

  function redo() {
    if (!_redo.length) return null;
    const entry = _redo.pop();
    applyPatches(_doc, entry.patches);
    _undo.push(entry);
    if (_undo.length > HISTORY_LIMIT) _undo.shift();
    _scheduleNotif(_notifFromPatches(entry.patches, 'redo'));
    return { selectionSnapshot: entry.selectionSnapshot ?? null };
  }

  function canUndo() { return _undo.length > 0; }
  function canRedo() { return _redo.length > 0; }

  function subscribe(scope, fn) {
    const entry = { scope, fn, seq: _seq };
    _subs.push(entry);
    return () => {
      const idx = _subs.indexOf(entry);
      if (idx !== -1) _subs.splice(idx, 1);
    };
  }

  return { get, apply, begin, preview, commit, cancel, undo, redo, canUndo, canRedo, subscribe };
}
