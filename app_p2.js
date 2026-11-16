/* ============================================================
   app_p2.js — 本実験 第2期（外部委託による募集）SPA 制御
   第1期（app_v3.js）からの変更点（2026-11-16）
   1. 刺激：「質問へ進む」の条件を「5枚すべてに到達」だけにした（秒数の下限なし。委託先の条件）。
      教示から「十分に読まないと次に進めない」の記述を削除。閲覧時間の記録は第1期と同じ。
   2. スクリーニング：「以前この調査に回答したか」を追加。対象外（年齢・Instagram 頻度・回答歴）の人は
      ダミー質問（保存しない）のあと確認コードを表示。カウンタは使わない。
   3. 確認コード：1人ずつ異なる4文字の半角英数字（2026-11-16 変更。makeCode を参照）。
      事後説明で使用に同意しなかった人にも表示する。照合のため、コードを CSV（completion_code）と
      対象外の人の記録（<pid>_screenout.json）に保存する。
   4. 同意文：募集元・謝礼・質問が人により異なる場合があること・ワーカーIDを収集しないことを追記。
   5. CSV に phase（=2）・prior_part・viewed_all を追加（datasink_p2.js）。
   自由記述の帰属（30秒・空欄不可）と、測定項目・順序は第1期と同一。
   ------------------------------------------------------------
   画面の流れ（procedure_v1.md 第1節）
     同意 → スクリーニング → 割当（ckpt0）→ 教示 → 刺激（強制閲覧ゲート, ckpt1）
     → 自由記述の帰属（30秒・空欄不可）→ 広告信頼性 → 企業評価（ckpt2）→ 欺瞞知覚
     → 動機帰属 → 操作チェック（1A → いいね数の知覚 → 広告の認識）※1B は 2026-10-13 に削除
     → 適合度＋指示型注意チェック → 内容の再認 → SKEP・NCS
     → デモグラ（ckpt3）→ 事後説明 → 使用への同意の選択 → 最終送信 → 完了
   依存：assignment_table.js / assignment_p2.js / stimuli_v3.js / carousel_instrumented.js（第2期版）/
         datasink_p2.js / questions_p2.js(Battery) / render.js(Render)
   ============================================================ */
(function (global) {
  'use strict';

  const app = document.getElementById('app');
  const B = global.Battery, R = global.Render, A = global.Assignment;
  const BRAND = 'KIORI';
  const CTX = { cause: B.CAUSE[BRAND], brand: B.BRAND[BRAND], likMin: B.LIK.min, likMax: B.LIK.max };
  const CONTACT = 'un131miworld@stu.kanazawa-u.ac.jp';

  // ★確認コード（2026-11-16 委託先の指示：合致者・非合致者とも2〜4文字の半角英数字。スマホで手打ちするため）
  //   1人ずつ異なる4文字のコードを発行する。見間違えやすい文字（0, 1, O, I, L, Z）は使わない。
  //   main      ：最後まで回答した人（使用に同意しなかった人を含む）→ 先頭が数字（例：7K4P）
  //   screenout ：スクリーニング対象外の人                         → 先頭が英字（例：HR3W）
  //   main は DataPipe のカウンタ番号を2・3文字目に埋め込むため、カウンタ番号が 900 未満の間は重複しない。
  //   カウンタがない場合（不通時の割当・テスト）と screenout は乱数のみ（重複はまれだが起こりうる → 照合は時刻で補う）。
  const CODE_DIGITS = '23456789';
  const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXY';
  const CODE_CHARS = CODE_DIGITS + CODE_LETTERS;   // 30文字
  // ★第2期の閲覧条件：秒数の下限なし（5枚すべてへの到達だけを条件にする）
  const GATE = { minSlideMs: 0, minSlide4Ms: 0 };

  let STATE = null, controller = null, pageT0 = 0, finished = false;

  function show(html) { app.innerHTML = html; global.scrollTo(0, 0); pageT0 = performance.now(); }
  function pageSec(key) { STATE.pageSec[key] = Math.round((performance.now() - pageT0) / 100) / 10; }
  function num(v) { const n = Number(v); return (v === undefined || v === '' || isNaN(n)) ? '' : n; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function idsOf(spec) { return spec.items.map(function (i) { return i.id; }); }
  function isMobile() {
    const ua = navigator.userAgent || '';
    return (/Mobi|Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) ? 1 : 0;
  }

  // 離脱防止の確認（完了後は出さない）
  global.addEventListener('beforeunload', function (e) {
    if (STATE && STATE.ts_assigned && !finished) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- 共通：質問ページ ---------- */
  // sections: HTML文字列の配列, required: 必須ID, key: 所要時間の記録名, next: 次の画面
  function questionPage(title, sections, required, key, next, opts) {
    opts = opts || {};
    show('<div class="screen">' + (opts.progress ? '<div class="progress">' + opts.progress + '</div>' : '') +
      '<h1>' + title + '</h1><div class="qform" id="qf">' +
      sections.map(function (s) { return '<section class="q-section">' + s + '</section>'; }).join('') +
      '</div><div class="actions"><button class="btn" id="qNext">次へ</button></div></div>');
    document.getElementById('qNext').onclick = async function () {
      const root = document.getElementById('qf');
      const miss = R.firstMissing(root, required);
      if (miss) { R.markMissing(root, miss); return; }
      const v = R.collect(root);
      required.forEach(function (id) { STATE.answers[id] = num(v[id]) === '' ? v[id] : num(v[id]); });
      if (opts.onCollect) opts.onCollect(v, root);
      pageSec(key);
      if (opts.checkpoint !== undefined) {
        this.disabled = true;
        try { await global.DataSink.saveCheckpoint(STATE, opts.checkpoint); } catch (e) { /* 継続 */ }
      }
      next();
    };
  }

  /* ---------- 入場 ---------- */
  function start() {
    const st = A.getStatus();
    if (st === 'completed' || st === 'screened_out') { screenAlreadyDone(); return; }
    STATE = {
      participant_id: A.getParticipantId(),
      phase: A.PHASE,
      ts_start: new Date().toISOString(),
      user_agent: navigator.userAgent,
      screen_w: (global.screen && global.screen.width) || '',
      screen_h: (global.screen && global.screen.height) || '',
      is_mobile: isMobile(),
      test_mode: A.TEST_MODE ? 1 : 0,
      table_seed: A.TABLE_SEED, use_table: A.USE_TABLE ? 1 : 0,
      answers: {}, pageSec: {},
    };
    screenConsent();
  }

  function randIndex(n) {
    try { const a = new Uint32Array(1); global.crypto.getRandomValues(a); return a[0] % n; }
    catch (e) { return Math.floor(Math.random() * n); }
  }
  function pick(chars) { return chars[randIndex(chars.length)]; }
  // kind = 'main' | 'screenout'。counter はカウンタ番号（なければ null）
  function makeCode(kind, counter) {
    const L = CODE_CHARS.length;
    if (kind === 'main') {
      const n = Number(counter);
      if (counter !== '' && counter !== null && counter !== undefined && Number.isInteger(n) && n >= 0 && n < L * L) {
        return pick(CODE_DIGITS) + CODE_CHARS[Math.floor(n / L)] + CODE_CHARS[n % L] + pick(CODE_CHARS);
      }
      return pick(CODE_DIGITS) + pick(CODE_CHARS) + pick(CODE_CHARS) + pick(CODE_CHARS);
    }
    return pick(CODE_LETTERS) + pick(CODE_CHARS) + pick(CODE_CHARS) + pick(CODE_CHARS);
  }
  function codeBlock(code) {
    return '<p class="code">確認コード：<strong style="letter-spacing:.15em">' + esc(code) + '</strong></p>' +
      '<p class="small">このコード（半角英数字4文字）を募集元のページに入力してください。英字は大文字・小文字のどちらで入力しても構いません。</p>';
  }

  function screenAlreadyDone() {
    const code = A.getSavedCode();
    show('<div class="screen"><h1>ご協力ありがとうございました</h1><p>この端末からはすでに回答が完了しています。重複して回答することはできません。</p>' +
      (code ? codeBlock(code) : '') + '</div>');
  }

  /* ---------- 同意（保存先・撤回方法・件数を本実験用に変更） ---------- */
  function screenConsent() {
    show(
      '<div class="screen"><h1>研究へのご協力のお願い</h1>' +
      '<h2 class="sec">1. SNS広告に関する調査</h2>' +
      '<p>実施者：金沢大学人間社会学域人文学類心理学P４年　山下将輝</p>' +
      '<h2 class="sec">2. 研究の目的</h2>' +
      '<p>本調査は、SNS上の投稿に対する印象を調べる学術研究（卒業研究）です。研究の性質上、詳細な目的は回答終了後にご説明します。</p>' +
      '<h2 class="sec">3. ご協力いただく内容と所要時間</h2>' +
      '<p>SNS投稿を模した画像を1件ご覧いただき、その投稿や企業についての印象と、広告やご自身についての考えをお答えいただきます。所要時間は約10〜15分です。はじめの質問へのご回答によっては、質問の内容や数が異なる場合があります（その場合も、最後に確認コードが表示されます）。</p>' +
      '<p>本調査は、調査の募集元を通じて参加者を募集しています。謝礼は、募集元の規定に従ってお支払いします。回答の最後に表示される確認コードを、募集元のページに入力してください。</p>' +
      '<h2 class="sec">4. 収集する情報</h2>' +
      '<ul class="notes"><li>質問項目へのご回答（年齢、性別、職業区分など）</li><li>操作の記録（所要時間、使用端末の種類など）</li>' +
      '<li>氏名・住所・メールアドレスなど、個人を直接特定できる情報は収集しません。募集元のアカウント情報（ユーザーIDなど）も、この調査では収集しません。</li></ul>' +
      '<h2 class="sec">5. データの取扱いと保管</h2>' +
      '<p>ご回答は匿名で処理し、研究目的以外には使用しません。データは、研究者本人が管理するクラウドストレージ（Google Drive）上に非公開で保管します。研究成果を公表する際も、個人が特定される形で示すことはありません。研究終了後は適切に廃棄します。</p>' +
      '<h2 class="sec">6. 参加の任意性と撤回について</h2>' +
      '<ul class="notes"><li>参加は任意です。参加しないことによる不利益は一切ありません。</li>' +
      '<li>回答の途中でいつでも中断できます。中断された場合、それまでの回答は使用しません。中断された場合の謝礼の扱いは、募集元の規定に従います。</li>' +
      '<li>回答の最後に研究の詳しい説明をお読みいただいたうえで、回答を研究に使用することに同意するかどうかを選んでいただけます。同意されない場合、回答は保存しません。同意されない場合も確認コードは表示され、謝礼に影響はありません。</li>' +
      '<li>使用に同意して送信された回答は匿名のため、後から個々のデータを特定して削除することはできません。</li></ul>' +
      '<h2 class="sec">7. 予想される負担・リスク</h2>' +
      '<p>本調査による身体的・心理的な負担は最小限ですが、回答したくない設問がある場合は、参加を中断していただいて構いません。</p>' +
      '<h2 class="sec">8. お問い合わせ先</h2>' +
      '<p>本研究に関するご質問は、下記までご連絡ください。<br>山下将輝　連絡先：' + CONTACT + '</p>' +
      '<h2 class="sec">9. 同意の確認</h2>' +
      '<p>上記の内容をお読みいただき、内容を理解したうえで本研究に参加することに同意される場合は、「同意して開始」を押してください。</p>' +
      '<div class="actions"><button class="btn secondary" id="declineBtn">同意しない</button><button class="btn" id="agreeBtn">同意して開始</button></div></div>'
    );
    document.getElementById('agreeBtn').onclick = screenScreening;
    document.getElementById('declineBtn').onclick = function () {
      show('<div class="screen"><h1>ありがとうございました</h1><p>調査を終了しました。ウィンドウを閉じてください。</p></div>');
    };
  }

  /* ---------- スクリーニング ---------- */
  function screenScreening() {
    show('<div class="screen"><h1>はじめに</h1><div class="qform" id="scrForm">' +
      R.item(B.screening.age, {}, 'number') + R.item(B.screening.insta, {}, 'freq5') + R.item(B.screening.prior, {}, 'mc') +
      '</div><div class="actions"><button class="btn" id="scrNext">次へ</button></div></div>');
    document.getElementById('scrNext').onclick = function () {
      const root = document.getElementById('scrForm');
      const miss = R.firstMissing(root, ['age', 'insta_freq', 'prior_part']);
      if (miss) { R.markMissing(root, miss); return; }
      const v = R.collect(root);
      const age = parseInt(v.age, 10), insta = parseInt(v.insta_freq, 10);
      if (isNaN(age) || age < 18 || age > 29 || insta < B.insta_MIN_FREQ || v.prior_part !== 'いいえ') {
        screenDummy();   // 対象外：ダミー質問 → 確認コード（回答は保存しない・カウンタを使わない）
        return;
      }
      STATE.age = age; STATE.insta_freq = insta; STATE.prior_part = v.prior_part;
      assignAndContinue();   // 適格者だけがカウンタ番号を消費する
    };
  }

  /* ---------- スクリーニング対象外：ダミー質問（回答は保存しない）→ 確認コード
       照合のため、確認コードと時刻だけを <pid>_screenout.json に保存する（回答は含めない） ---------- */
  function screenDummy() {
    show('<div class="screen"><h1>SNSの利用についてお聞きします</h1><div class="qform" id="dumForm">' +
      B.dummy.map(function (it) { return R.item(it, CTX); }).join('') +
      '</div><div class="actions"><button class="btn" id="dumNext">次へ</button></div></div>');
    document.getElementById('dumNext').onclick = async function () {
      const root = document.getElementById('dumForm');
      const miss = R.firstMissing(root, B.dummy.map(function (it) { return it.id; }));
      if (miss) { R.markMissing(root, miss); return; }
      this.disabled = true;
      const code = makeCode('screenout', null);
      A.markScreenedOut(STATE.participant_id, code);
      try { await global.DataSink.saveScreenout(STATE, code); } catch (e) { /* 保存に失敗してもコードは表示する */ }
      show('<div class="screen"><h1>ご協力ありがとうございました</h1><p>これで調査は終了です。</p>' + codeBlock(code) + '</div>');
    };
  }

  /* ---------- 割当 ---------- */
  async function assignAndContinue() {
    show('<div class="screen"><p class="lead">準備しています…</p></div>');
    const a = await A.assignCondition(STATE.participant_id);
    STATE.cell = a.cell;
    STATE.likes_level = a.likesLevel;
    STATE.likesText = a.likesText;
    STATE.disclosure = a.disclosure;
    STATE.counter_index = (a.counterIndex === null || a.counterIndex === undefined) ? '' : a.counterIndex;
    STATE.assignment_fallback = a.assignmentFallback ? 1 : 0;
    STATE.ts_assigned = a.tsAssigned;
    STATE.resumed_session = a.resumed ? 1 : 0;
    try { await global.DataSink.saveCheckpoint(STATE, 0); } catch (e) { /* 継続 */ }
    screenInstructions();
  }

  /* ---------- 教示 ---------- */
  function screenInstructions() {
    show(
      '<div class="screen"><h1>この調査で行っていただくこと</h1>' +
      '<p>これから、<strong>木製家具を製造・販売する架空の企業「KIORI」のSNS広告を想定した投稿</strong>を1件ご覧いただきます。企業名・活動内容はすべて研究用に作成したもので、実在の企業とは関係ありません。</p>' +
      '<p>投稿は、Instagramでよく見られる<strong>カルーセル（複数枚の画像）とキャプション（画像下の文章）</strong>で構成されています。画像の中にも文章が書かれていますので、<strong>画像とキャプションの両方</strong>に目を通してください。普段SNSで気になった投稿を読むときと同じように、内容を読み進めていただければ結構です。</p>' +
      '<p>投稿を読み終えたら、<strong>その投稿や企業から受けた印象についていくつかの質問</strong>にお答えいただきます。ご自身が感じたままにお答えください。<strong>正解・不正解はありません。</strong></p>' +
      '<h2 class="sec">操作方法</h2><ul class="notes">' +
      '<li>カルーセルは、左右のスワイプ（またはボタン）で次の画像へ進みます。</li>' +
      '<li>5枚すべての画像を表示すると「質問へ進む」ボタンが押せるようになります。すべての画像とキャプションを最後まで読んでから、ボタンを押してください。</li>' +
      '<li>回答の途中で、ブラウザの「戻る」やページの再読み込みはしないでください。</li></ul>' +
      '<p>準備ができましたら、「はじめる」を押してください。</p>' +
      '<div class="actions"><button class="btn" id="beginBtn">はじめる</button></div></div>'
    );
    document.getElementById('beginBtn').onclick = screenStimulus;
  }

  /* ---------- 刺激（第2期：5枚すべてへの到達のみを条件とする） ---------- */
  function screenStimulus() {
    show(
      '<div class="screen wide"><div class="stim-instruction">' +
      '<p><strong>1枚1枚のカルーセルおよびキャプションを最後までしっかり読んでください。</strong>5枚すべての画像を表示すると「質問へ進む」ボタンが押せるようになります。<strong>すべての画像とキャプションを読み終えてから</strong>、ボタンを押してください。</p>' +
      '<p class="sub">この後、この投稿について印象をお伺いします。急がず内容を確かめながら、よくお読みください。</p></div>' +
      '<div id="stimStage"></div>' +
      '<div class="actions"><button class="btn" id="toQuestions" disabled>質問へ進む</button></div></div>'
    );
    controller = global.Stimuli.mountStimulus(document.getElementById('stimStage'), STATE.disclosure.toLowerCase(), STATE.likesText, {
      onGate: function () { const b = document.getElementById('toQuestions'); if (b) b.disabled = false; },
      minSlideMs: GATE.minSlideMs, minSlide4Ms: GATE.minSlide4Ms,
    });
    document.getElementById('toQuestions').onclick = async function () {
      STATE.timing = controller.getTimingData();
      controller.destroy(); controller = null;
      pageSec('stimulus');
      this.disabled = true;
      try { await global.DataSink.saveCheckpoint(STATE, 1); } catch (e) { /* 継続 */ }
      screenAttribution();
    };
  }

  /* ---------- 評価前の帰属（自由記述・30秒・空欄不可） ---------- */
  function screenAttribution() {
    const at = B.attribution;
    show('<div class="screen"><h1>この投稿についてお聞きします</h1>' +
      '<div class="q-item"><div class="q-text">' + esc(R.sub(at.text, CTX)) + '</div>' +
      '<textarea class="q-textarea" id="attrText" rows="6"></textarea>' +
      '<p class="small">' + esc(at.note) + '</p></div>' +
      '<div class="actions"><button class="btn" id="attrNext" disabled>次へ（あと' + at.minSeconds + '秒）</button></div></div>');
    const t0 = performance.now();
    const btn = document.getElementById('attrNext');
    const ta = document.getElementById('attrText');
    const timer = setInterval(function () {
      const left = Math.max(0, at.minSeconds - Math.floor((performance.now() - t0) / 1000));
      const filled = ta.value.trim().length > 0;
      if (left > 0) { btn.disabled = true; btn.textContent = '次へ（あと' + left + '秒）'; }
      else { btn.disabled = !filled; btn.textContent = filled ? '次へ' : '次へ（記入してください）'; }
    }, 250);
    btn.onclick = function () {
      const txt = ta.value.trim();
      if ((performance.now() - t0) / 1000 < at.minSeconds || !txt) return;
      clearInterval(timer);
      STATE.attr_text = txt;
      STATE.attr_chars = Array.from(txt).length;
      STATE.attr_sec = Math.round((performance.now() - t0) / 100) / 10;
      screenCred();
    };
  }

  /* ---------- 広告信頼性 → 企業評価 → 欺瞞知覚 ---------- */
  function screenCred() {
    questionPage('この広告（投稿）についてお答えください', [R.block(B.adCred, CTX)], idsOf(B.adCred), 'cred', screenFirm);
  }
  function screenFirm() {
    questionPage('この企業についてお答えください', [R.block(B.firmEval, CTX)], idsOf(B.firmEval), 'firm', screenDec, { checkpoint: 2 });
  }
  function screenDec() {
    questionPage('この広告（投稿）についてお答えください', [R.block(B.deception, CTX)], idsOf(B.deception), 'dec', screenMotive);
  }

  /* ---------- 動機帰属（提示順ランダム、順序を記録） ---------- */
  function screenMotive() {
    questionPage('この企業についてお答えください', [R.block(B.motive, CTX)], idsOf(B.motive), 'motive', screenChecks, {
      onCollect: function (v, root) {
        STATE.motive_order = Array.prototype.map.call(root.querySelectorAll('.q-item'), function (el) {
          return el.getAttribute('data-qid').replace('motive_', '');
        }).join('-');
      },
    });
  }

  /* ---------- 操作チェック：1A → いいね数の知覚 → 広告の認識（1B は削除） ---------- */
  function screenChecks() {
    const req = idsOf(B.item1A).concat(idsOf(B.checks));
    questionPage('この投稿の内容についてお答えください',
      [R.block(B.item1A, CTX), R.block(B.checks, CTX)], req, 'checks', screenFitAttn);
  }

  /* ---------- 適合度＋指示型 → 内容の再認（同じ画面）※ブランド既知は 2026-10-15 に削除 ---------- */
  function screenFitAttn() {
    const recog = Object.assign({}, B.attention, { options: R.shuffle(B.attention.options.slice()) });
    const req = idsOf(B.fit).concat([B.attention.id]);
    questionPage('あと少しです', [R.block(B.fit, CTX), R.item(recog, CTX)], req, 'fit_attn', screenSkepNcs, {
      onCollect: function (v) {
        STATE.answers.attn_recog_choice = v[B.attention.id];
        delete STATE.answers[B.attention.id];
        STATE.answers.attn_recog_correct = (v[B.attention.id] === B.attention.correct) ? 1 : 0;
        const instr = B.fit.items.filter(function (i) { return i.instructed; })[0];
        STATE.answers.attn_instructed_correct = (String(v[instr.id]) === instr.correct) ? 1 : 0;
      },
    });
  }

  /* ---------- SKEP・NCS ---------- */
  function screenSkepNcs() {
    const req = idsOf(B.skep).concat(idsOf(B.ncs));
    questionPage('広告とあなた自身についてお答えください', [R.block(B.skep, CTX), R.block(B.ncs, CTX)], req, 'skep_ncs', screenDemographics);
  }

  /* ---------- デモグラフィック ---------- */
  function screenDemographics() {
    show('<div class="screen"><h1>最後に、あなたについて教えてください</h1><div class="qform" id="demoForm">' +
      B.demographics.map(function (it) { return R.item(it, {}); }).join('') +
      '<div class="q-item"><div class="q-text">お気づきの点があればご自由にお書きください（任意）。</div>' +
      '<textarea class="q-textarea" name="feedback_text" rows="3"></textarea></div>' +
      '</div><div class="actions"><button class="btn" id="demoNext">次へ</button></div></div>');
    document.getElementById('demoNext').onclick = async function () {
      const root = document.getElementById('demoForm');
      const miss = R.firstMissing(root, ['gender', 'occupation']);
      if (miss) { R.markMissing(root, miss); return; }
      const v = R.collect(root);
      STATE.gender = v.gender; STATE.occupation = v.occupation; STATE.feedback_text = v.feedback_text || '';
      pageSec('demo');
      this.disabled = true;
      try { await global.DataSink.saveCheckpoint(STATE, 3); } catch (e) { /* 継続 */ }
      screenDebrief();
    };
  }

  /* ---------- 事後説明 → 使用への同意の選択 ---------- */
  function screenDebrief() {
    show(
      '<div class="screen"><h1>研究についてのご説明</h1>' +
      '<p>ご回答ありがとうございました。本研究の目的は、企業が自社の利益について述べる表現の明確さと、投稿についた「いいね」の数が、広告や企業の受け取られ方にどのように影響するかを調べることでした。そのため、回答前にはお伝えしていなかった点があります。</p>' +
      '<ul class="notes">' +
      '<li><strong>KIORI は実在しない架空のブランド</strong>で、Re:Furniture プロジェクトも架空の活動です。</li>' +
      '<li>投稿に表示されていた<strong>「いいね」の数は、研究のために設定した数値</strong>です。参加者によって異なる数が表示されています。</li>' +
      '<li>企業の目的に関する文章は研究者が作成したもので、<strong>参加者によって異なる文章</strong>が表示されています。</li>' +
      '<li>2枚目の画像の<strong>「年間 約60万トン（出典：環境省 2023）」には実際の出典がなく、研究用に作成した架空の数値</strong>です。環境省が公表した数値ではありませんので、ご注意ください。</li></ul>' +
      '<p>この説明をお読みいただいたうえで、あなたの回答を研究に使用することに同意いただけるかをお選びください。同意されない場合、回答は保存せず、研究には使用しません。どちらを選んでも不利益はありません。</p>' +
      '<p class="small">ご質問は ' + CONTACT + ' までご連絡ください。</p>' +
      '<div class="actions"><button class="btn secondary" id="refuseBtn">回答の使用に同意しない</button><button class="btn" id="consentBtn">回答の使用に同意する</button></div></div>'
    );
    document.getElementById('consentBtn').onclick = function () { pageSec('debrief'); STATE.post_debrief_consent = 1; STATE.consentRefused = false; finish(); };
    document.getElementById('refuseBtn').onclick = function () { pageSec('debrief'); STATE.post_debrief_consent = 0; STATE.consentRefused = true; finish(); };
  }

  /* ---------- フラグ算出・最終送信 ---------- */
  function computeFlags() {
    const a = STATE.answers;
    // 直線回答：逆転項目を含む3尺度（欺瞞知覚・動機帰属・適合度の本来の4項目）で全項目同一の数
    const scales = [idsOf(B.deception), idsOf(B.motive), ['fit_1', 'fit_2', 'fit_3', 'fit_4']];
    const n = scales.filter(function (ids) {
      const vals = ids.map(function (id) { return Number(a[id]); });
      return vals.every(function (x) { return x === vals[0]; });
    }).length;
    STATE.n_straightline_scales = n;
    STATE.flag_straightline = n >= 2 ? 1 : 0;
    STATE.flag_straightline_one = n === 1 ? 1 : 0;
    STATE.flag_attn_fail = (a.attn_instructed_correct === 1 && a.attn_recog_correct === 1) ? 0 : 1;
  }

  async function finish() {
    show('<div class="screen"><p class="lead">保存しています。ページを閉じずにお待ちください…</p></div>');
    STATE.ts_end = new Date().toISOString();
    STATE.duration_total_sec = Math.round((Date.parse(STATE.ts_end) - Date.parse(STATE.ts_start)) / 1000);
    computeFlags();
    if (!STATE.completion_code) STATE.completion_code = makeCode('main', STATE.counter_index);   // 再送信でも同じコード
    let ok = false;
    try { ok = await global.DataSink.submitFinal(STATE); } catch (e) { ok = false; }
    if (ok) { finished = true; A.markCompleted(STATE.completion_code); screenThanks(); }
    else screenError();
  }

  function screenThanks() {
    const html = '<div class="screen"><h1>ご協力ありがとうございました</h1>' +
      (STATE.consentRefused ? '<p>ご回答は保存せず、研究には使用しません。</p>' : '<p>これで調査は終了です。ご協力に感謝いたします。</p>') +
      codeBlock(STATE.completion_code) +
      (A.TEST_MODE ? '<details open><summary>テストモード：保存されるはずのデータ</summary><pre id="testOut" style="white-space:pre-wrap;font-size:11px"></pre></details>' : '') +
      '</div>';
    show(html);
    if (A.TEST_MODE) document.getElementById('testOut').textContent = JSON.stringify(global.__TEST_OUTPUT, null, 1);
  }

  function screenError() {
    show('<div class="screen"><h1>送信に失敗しました</h1>' +
      '<p>通信環境により保存が完了しませんでした。下のボタンをもう一度お試しください。解決しない場合は ' + CONTACT + ' までご連絡ください。</p>' +
      '<div class="actions"><button class="btn" id="retryBtn">もう一度送信する</button></div></div>');
    document.getElementById('retryBtn').onclick = finish;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  global.App = { getState: function () { return STATE; } };
})(window);
