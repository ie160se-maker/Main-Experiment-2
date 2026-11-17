/* ============================================================
   assignment_p2.js — 本実験 第2期（外部委託による募集）：参加者ID発行 & 6セル割当
   第1期（assignment_v3.js）からの変更点（2026-11-16）
   ・第2期専用の DataPipe 実験ID（新規作成）を使う。条件数は第1期と同じ 360。
     割当表（assignment_table.js）は第1期と同じものを行0から使う
     → 第2期の中でも6人ごとに6セルがそろう。
   ・参加者IDの頭文字を 'w-' にする（第1期は 'm-'）。
   ・ブラウザ内の保存に「スクリーニング対象外（screened_out）」の状態と確認コードを加える。
     同じブラウザで再び開いた場合は、対象外の人にも完了者にも、確認コードだけを再表示する。
   それ以外（割当表・カウンタの使い方・再読み込み時の再利用・不通時のブラウザ内割当・
   テストモード ?test=1&cell=N・?multi=1）は第1期と同じ。
   ============================================================ */
(function (global) {
  'use strict';

  // ★第2期用に新しく作成した DataPipe 実験IDに差し替える（第1期のIDは使わない）
  const EXPERIMENT_ID = 'pwCFjyFRkGNY';
  const CONDITION_URL = 'https://pipe.jspsych.org/api/condition/';
  const PHASE = 2;
  const ID_PREFIX = 'w-';

  const TABLE = (global.ASSIGNMENT_TABLE && global.ASSIGNMENT_TABLE.cells) || [0, 1, 2, 3, 4, 5];
  const USE_TABLE = true;                       // DataPipe の条件数を 360 にできない場合は false
  const TABLE_LEN = TABLE.length;               // 360
  const N_CELLS = 6;

  const STORE_KEY = 'assign_p2_' + EXPERIMENT_ID;
  const LIKES = { low: '27 likes', high: '15,376 likes' };
  const DISCLOSURE = ['A', 'B', 'C'];

  const params = new URLSearchParams(global.location.search);
  const TEST_MODE = params.get('test') === '1';
  // 確認用：?multi=1 で同一端末からの複数回答を許可（参加者には配らない。ID は multi- で始まり、分析から除外）
  const MULTI_MODE = params.get('multi') === '1';
  if (MULTI_MODE) { try { global.localStorage.removeItem(STORE_KEY); } catch (e) { /* 継続 */ } }

  /* ---------- ブラウザ内保存（失敗しても動作は続ける） ---------- */
  function loadRaw() {
    try { return JSON.parse(global.localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }
  function loadSaved() {
    const s = loadRaw();
    return (s && Number.isInteger(s.cell)) ? s : null;
  }
  function save(obj) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* 継続 */ }
  }

  /* ---------- 参加者ID：保存済み → ?pid= → 新規発行 ---------- */
  function getParticipantId() {
    if (!TEST_MODE) {
      const saved = loadRaw();
      if (saved && saved.participantId) return saved.participantId;
    }
    const pid = params.get('pid');
    if (pid && /^[A-Za-z0-9_-]{3,64}$/.test(pid)) return pid;
    return (TEST_MODE ? 'test-' : (MULTI_MODE ? 'multi-' : ID_PREFIX)) + randomID(10);
  }
  function randomID(n) {
    const chars = '0123456789abcdefghjklmnopqrstuvwxyz';
    let s = '';
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // 'new'：初回／'assigned'：割当済み・未完了／'completed'：回答完了／'screened_out'：スクリーニング対象外
  function getStatus() {
    if (TEST_MODE) return 'new';
    const s = loadRaw();
    if (!s) return 'new';
    if (s.screenedOut) return 'screened_out';
    if (!Number.isInteger(s.cell)) return 'new';
    return s.completed ? 'completed' : 'assigned';
  }
  function getSavedCode() { const s = loadRaw(); return (s && s.code) || ''; }

  /* ---------- スクリーニング対象外（カウンタを使わない・割当しない） ---------- */
  function markScreenedOut(participantId, code) {
    if (TEST_MODE) return;
    save({ participantId: participantId, screenedOut: true, code: code, ts: new Date().toISOString() });
  }

  /* ---------- セル番号 → 条件 ---------- */
  function decode(cell) {
    return {
      cell: cell,
      likesLevel: cell < 3 ? 'low' : 'high',
      likesText: cell < 3 ? LIKES.low : LIKES.high,
      disclosure: DISCLOSURE[cell % 3],
    };
  }

  /* ---------- 割当 ---------- */
  async function assignCondition(participantId) {
    // (1) 割当済みなら再利用（DataPipe に要求しない）
    const saved = TEST_MODE ? null : loadSaved();
    if (saved) {
      return Object.assign(decode(saved.cell), {
        counterIndex: saved.counterIndex, assignmentFallback: saved.assignmentFallback,
        tsAssigned: saved.tsAssigned, resumed: true,
      });
    }

    let counterIndex = null, cell = null, fallback = false;

    if (TEST_MODE) {
      // (2) テスト：本番カウンタを使わない
      const c = parseInt(params.get('cell'), 10);
      cell = (c >= 0 && c < N_CELLS) ? c : Math.floor(Math.random() * N_CELLS);
    } else {
      // (3) 本番：DataPipe にカウンタ番号を要求（リトライ3回）
      for (let attempt = 0; attempt < 3 && counterIndex === null; attempt++) {
        try {
          const res = await fetch(CONDITION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: '*/*' },
            body: JSON.stringify({ experimentID: EXPERIMENT_ID }),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          const raw = (json && json.condition !== undefined) ? json.condition : json;
          const n = (typeof raw === 'number') ? raw : parseInt(raw, 10);
          if (!isNaN(n) && n >= 0) counterIndex = n;
        } catch (e) {
          await sleep(1000 * Math.pow(2, attempt));
        }
      }
      if (counterIndex === null) {
        cell = Math.floor(Math.random() * N_CELLS);   // 不通時：ブラウザ内で無作為割当
        fallback = true;
      } else {
        cell = USE_TABLE ? TABLE[counterIndex % TABLE_LEN] : (counterIndex % N_CELLS);
      }
    }

    const tsAssigned = new Date().toISOString();
    if (!TEST_MODE) {
      save({ participantId: participantId, cell: cell, counterIndex: counterIndex,
             assignmentFallback: fallback, tsAssigned: tsAssigned, completed: false });
    }
    return Object.assign(decode(cell), {
      counterIndex: counterIndex, assignmentFallback: fallback, tsAssigned: tsAssigned, resumed: false,
    });
  }

  function markCompleted(code) {
    const saved = loadSaved();
    if (saved) { saved.completed = true; saved.code = code || ''; saved.tsCompleted = new Date().toISOString(); save(saved); }
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  global.Assignment = {
    getParticipantId, getStatus, getSavedCode, assignCondition, markCompleted, markScreenedOut, decode,
    EXPERIMENT_ID, PHASE, TEST_MODE, MULTI_MODE, USE_TABLE, TABLE_LEN, TABLE_SEED: (global.ASSIGNMENT_TABLE || {}).seed,
  };
})(window);
