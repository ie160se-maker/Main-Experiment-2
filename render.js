(function (global) {
  'use strict';
  function sub(text, ctx) {
    ctx = ctx || {};
    return String(text || '').replace(/\{CAUSE\}/g, ctx.cause || '').replace(/\{BRAND\}/g, ctx.brand || '');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function scaleRow(id, n, leftLabel, rightLabel) {
    var cells = '';
    for (var v = 1; v <= n; v++) {
      cells += '<label class="pt"><input type="radio" name="' + id + '" value="' + v + '"><span class="num">' + v + '</span></label>';
    }
    return '<div class="q-scale">' +
      '<span class="anchor left">' + esc(leftLabel) + '</span>' +
      '<div class="pts">' + cells + '</div>' +
      '<span class="anchor right">' + esc(rightLabel) + '</span></div>';
  }
  function choiceRow(id, options) {
    return '<div class="q-choices">' + options.map(function (o) {
      var val = (typeof o === 'object') ? o.value : o;
      var lab = (typeof o === 'object') ? o.label : o;
      return '<label class="choice"><input type="radio" name="' + id + '" value="' + esc(val) + '"><span>' + esc(lab) + '</span></label>';
    }).join('') + '</div>';
  }
  function item(it, ctx, type) {
    type = type || it.type;
    var head = it.text ? '<div class="q-text">' + esc(sub(it.text, ctx)) + '</div>' : '';
    var body = '';
    switch (type) {
      case 'likert7':
        body = scaleRow(it.id, 7, ctx.likMin || '全くそう思わない', ctx.likMax || '非常にそう思う'); break;
      case 'semdiff7':
        body = scaleRow(it.id, 7, it.left, it.right); break;
      case 'scale7':
        body = scaleRow(it.id, 7, it.min, it.max); break;
      case 'freq5':
        body = choiceRow(it.id, (global.Battery.FREQ5).map(function (l, i) { return { value: (i + 1), label: (i + 1) + '　' + l }; })); break;
      case 'mc':
        body = choiceRow(it.id, it.options); break;
      case 'yesno':
        body = choiceRow(it.id, ['はい', 'いいえ']); break;
      case 'number':
        body = '<input class="q-number" type="number" name="' + it.id + '" min="' + (it.min != null ? it.min : '') + '" max="' + (it.max != null ? it.max : '') + '" inputmode="numeric">'; break;
      case 'freetext':
        body = '<textarea class="q-textarea" name="' + it.id + '" rows="3"></textarea>'; break;
      default:
        body = '<div class="q-error">未対応タイプ: ' + esc(type) + '</div>';
    }
    return '<div class="q-item" id="qi-' + it.id + '" data-qid="' + it.id + '">' + head + body + '</div>';
  }
  function block(spec, ctx) {
    var items = spec.items.slice();
    if (spec.randomize) shuffle(items);
    var html = spec.prompt ? '<div class="q-prompt">' + esc(sub(spec.prompt, ctx)) + '</div>' : '';
    html += items.map(function (it) { return item(it, ctx, spec.type); }).join('');
    return html;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function collect(root) {
    var out = {};
    root.querySelectorAll('input[type=radio]:checked').forEach(function (r) { out[r.name] = r.value; });
    root.querySelectorAll('input[type=number], input[type=text], textarea').forEach(function (el) {
      if (el.value !== '') out[el.name] = el.value;
    });
    return out;
  }
  function firstMissing(root, requiredIds) {
    var vals = collect(root);
    for (var i = 0; i < requiredIds.length; i++) {
      if (vals[requiredIds[i]] === undefined || vals[requiredIds[i]] === '') return requiredIds[i];
    }
    return null;
  }
  function markMissing(root, id) {
    root.querySelectorAll('.q-item.missing').forEach(function (e) { e.classList.remove('missing'); });
    var el = root.querySelector('#qi-' + CSS.escape(id));
    if (el) { el.classList.add('missing'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  global.Render = { sub: sub, item: item, block: block, collect: collect, firstMissing: firstMissing, markMissing: markMissing, shuffle: shuffle };
})(window);
