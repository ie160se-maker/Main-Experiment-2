/* ============================================================
   datasink_p2.js — 本実験 第2期（外部委託による募集）：DataPipe への保存
   第1期（datasink_v3.js）からの変更点（2026-11-16）
   ・CSV の末尾に3列を追加（第1期の103列は同じ順のまま → 合算時は第1期を phase = 1 とする）
       phase       ：2（第2期）
       prior_part  ：スクリーニングの「以前この調査に回答したか」の回答（通過者は「いいえ」）
       viewed_all  ：5枚すべてに到達したか（1/0）
     forced_pass は第2期の「質問へ進む」の条件（5枚すべてに到達、秒数の下限なし）を満たしたか。
     第1期の forced_pass（各2秒・4枚目5秒）とは意味が異なる点に注意。
   ・2026-11-19：事後説明後の使用への同意の選択をなくしたため、post_debrief_consent は空欄、
       最小限の行（minimalRow）は使われない。確認コードは全員共通の固定コード（6223／4815）。
   ・確認コード（2026-11-16 追加）：当初は1人ずつ異なるコードで照合に使う設計だった（11-19 に固定コードへ変更）。
       最後まで回答した人：CSV の末尾の completion_code（使用に同意しなかった人の最小限の行にも入れる）。
       スクリーニング対象外の人：<pid>_screenout.json（参加者ID・時期・コード・時刻のみ。回答は保存しない）。
   それ以外（進行記録に回答を含めない・使用を断った人は最小限の行・テストモード）は第1期と同じ。
   ============================================================ */
(function (global) {
  'use strict';

  const DATA_URL = 'https://pipe.jspsych.org/api/data/';
  function expId() { return global.Assignment.EXPERIMENT_ID; }
  function isTest() { return !!global.Assignment.TEST_MODE; }

  async function postToDataPipe(filename, dataString) {
    if (isTest()) {
      global.__TEST_OUTPUT = global.__TEST_OUTPUT || {};
      global.__TEST_OUTPUT[filename] = dataString;
      return true;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(DATA_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: '*/*' },
          body: JSON.stringify({ experimentID: expId(), filename: filename, data: dataString }),
        });
        if (res.ok) return true;
        if (res.status >= 400 && res.status < 500) return false;
      } catch (e) { /* ネットワーク断 → リトライ */ }
      await sleep(1000 * Math.pow(2, attempt));
    }
    return false;
  }

  /* ---------- 進行記録（回答は含めない） ---------- */
  const META_KEYS = ['participant_id', 'phase', 'cell', 'likes_level', 'disclosure', 'counter_index', 'assignment_fallback',
    'resumed_session', 'test_mode', 'ts_start', 'ts_assigned', 'user_agent', 'is_mobile'];
  async function saveCheckpoint(state, stage) {
    const rec = { stage: stage, ts: new Date().toISOString() };
    META_KEYS.forEach(function (k) { rec[k] = def(state[k]); });
    return postToDataPipe(state.participant_id + '_ckpt' + stage + '.json', JSON.stringify(rec));
  }

  /* ---------- スクリーニング対象外の人：確認コードの記録（回答は含めない） ---------- */
  async function saveScreenout(state, code) {
    const rec = { participant_id: state.participant_id, phase: def(state.phase), screened_out: 1,
      completion_code: code, test_mode: def(state.test_mode), ts: new Date().toISOString() };
    return postToDataPipe(state.participant_id + '_screenout.json', JSON.stringify(rec));
  }

  /* ---------- 最終保存 ---------- */
  async function submitFinal(state) {
    return postToDataPipe(state.participant_id + '.csv', stateToCSV(state));
  }

  /* ---------- 列定義（固定順。第1期の103列＋末尾3列） ---------- */
  function seq(prefix, n) { const a = []; for (let i = 1; i <= n; i++) a.push(prefix + i); return a; }
  const COLUMNS = [].concat(
    // メタ・割当
    ['participant_id', 'cell', 'likes_level', 'disclosure', 'counter_index', 'table_seed', 'use_table',
     'assignment_fallback', 'resumed_session', 'test_mode', 'post_debrief_consent',
     'ts_start', 'ts_assigned', 'ts_end', 'duration_total_sec', 'user_agent', 'screen_w', 'screen_h', 'is_mobile'],
    // スクリーニング
    ['age', 'insta_freq'],
    // 刺激の閲覧記録
    ['dwell_total', 'dwell_s1', 'dwell_s2', 'dwell_s3', 'dwell_s4', 'dwell_s5', 'slide4_first_arrival', 'n_nav', 'forced_pass'],
    // 評価前の帰属（自由記述）
    ['attr_text', 'attr_chars', 'attr_sec'],
    // 媒介変数・従属変数
    seq('cred_', 3), seq('firm_', 7), seq('dec_', 6),
    // 動機帰属・操作チェック
    seq('motive_', 8), ['motive_order'], seq('1A_', 3), ['likes_perc', 'ad_recog'],
    // 適合度・注意チェック
    seq('fit_', 4), ['attn_instructed', 'attn_instructed_correct', 'attn_recog_choice', 'attn_recog_correct'],
    // 共変量
    seq('skep_', 9), seq('ncs_', 6),
    // デモグラ
    ['gender', 'occupation', 'feedback_text'],
    // 画面ごとの所要時間（秒）
    ['sec_stimulus', 'sec_cred', 'sec_firm', 'sec_dec', 'sec_motive', 'sec_checks', 'sec_fit_attn', 'sec_skep_ncs', 'sec_demo', 'sec_debrief'],
    // 品質フラグ（クライアント算出。所要時間の基準は解析側で判定）
    ['flag_attn_fail', 'n_straightline_scales', 'flag_straightline', 'flag_straightline_one'],
    // ★第2期で追加
    ['phase', 'prior_part', 'viewed_all'],
    // ★2026-11-16 追加：確認コード（委託先の提出コードとの照合用）
    ['completion_code']
  );

  function stateToCSV(state) {
    const r = state.consentRefused ? minimalRow(state) : fullRow(state);
    const line = COLUMNS.map(function (k) { return csvEscape(r[k]); }).join(',');
    return COLUMNS.join(',') + '\n' + line + '\n';
  }

  function minimalRow(s) {
    const r = {};
    ['participant_id', 'cell', 'likes_level', 'disclosure', 'counter_index', 'table_seed', 'use_table',
     'assignment_fallback', 'resumed_session', 'test_mode', 'ts_start', 'ts_assigned', 'ts_end', 'phase', 'completion_code']
      .forEach(function (k) { r[k] = def(s[k]); });
    r.post_debrief_consent = 0;
    return r;
  }

  function fullRow(s) {
    const r = {};
    COLUMNS.forEach(function (k) { r[k] = ''; });
    // メタ・スクリーニング・フラグ・デモグラ・帰属などは state のトップレベルにそのまま入っている
    COLUMNS.forEach(function (k) { if (s[k] !== undefined && s[k] !== null && typeof s[k] !== 'object') r[k] = s[k]; });
    // 回答（answers：{id: value}）
    const a = s.answers || {};
    Object.keys(a).forEach(function (k) { if (k in r) r[k] = a[k]; });
    // 刺激の閲覧記録
    const t = s.timing || {};
    r.dwell_total = def(t.dwellTotal);
    for (let i = 1; i <= 5; i++) r['dwell_s' + i] = (t.dwell && t.dwell[i - 1] !== undefined) ? t.dwell[i - 1] : '';
    r.slide4_first_arrival = def(t.slide4FirstArrival);
    r.n_nav = def(t.nNav);
    r.forced_pass = t.forcedPass === undefined ? '' : (t.forcedPass ? 1 : 0);
    r.viewed_all = t.viewedAll === undefined ? '' : (t.viewedAll ? 1 : 0);
    // 画面ごとの所要時間
    const p = s.pageSec || {};
    Object.keys(p).forEach(function (k) { if (('sec_' + k) in r) r['sec_' + k] = p[k]; });
    return r;
  }

  function def(v) { return (v === null || v === undefined) ? '' : v; }
  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    const str = String(v);
    return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  global.DataSink = { saveCheckpoint, saveScreenout, submitFinal, stateToCSV, COLUMNS };
})(window);
