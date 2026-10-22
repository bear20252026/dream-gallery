// admin-docs.js — 协议文档编辑(designMode 原页直改;2026-10-09 自 admin.js 切出,逐字迁移)
// 状态自持(docCur/docDirty/docHead/docTail),唯一跨区需求是 loadDocs 给 switchTab。

import { tk, tk2, adminFetch, confirmAsync, $ } from './admin-core.js';
// 类型化取用(第十刀·批次2):标签全部按 admin.html 的真实 markup 核对过 ——
// #docFrame=<iframe>、#docSave/#docReload/#docRestore=<button>、#docBak=<select>、.doc-tabs 里是 <button>。
// `srcdoc`·`contentDocument` 只在 HTMLIFrameElement 上,`disabled` 只在表单/按钮上,
// 裸 `$()` 交回来的 HTMLElement 一个都没有 ⇒ 本文件原来报 18 条 TS2339。
// 助手本体只有 cast、不校验标签(边界写在 src/shared/dom-typed.js 文件头),运行期与 `$('…')` 逐字相同。
import { byIdBtn, byIdFrame, byIdSelect, qsaBtn } from '../shared/dom-typed.js';

// ---------- 协议文档编辑(designMode 原页直改;不进自动刷新) ----------
let docCur = 'agreement.html',
  docDirty = false,
  docHead = '',
  docTail = '';
export async function loadDocs() {
  if (docDirty) return; // 有未保存修改时绝不重载(防刷没)
  try {
    const r = await adminFetch('/api/admin/docs?file=' + encodeURIComponent(docCur) + tk2());
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '加载失败');
    const f = byIdFrame('docFrame'),
      bi = d.content.indexOf('<body>'),
      be = d.content.lastIndexOf('</body>');
    if (bi < 0 || be < 0) throw new Error('文件结构异常');
    docHead = d.content.slice(0, bi + 6);
    docTail = d.content.slice(be);
    f.srcdoc = d.content;
    f.onload = () => {
      try {
        const doc = f.contentDocument;
        doc.body.contentEditable = 'true';
        doc.body.style.outline = 'none';
        new MutationObserver(() => {
          docDirty = true;
          byIdBtn('docSave').disabled = false;
        }).observe(doc.body, { childList: true, subtree: true, characterData: true });
      } catch (e) {
        docMsg('编辑器初始化失败:' + (e.message || e), false); // 原:静默吞掉,假报"已加载"
        return;
      }
      docMsg('已加载 ' + docCur);
    };
  } catch (e) {
    docMsg(e.message, false);
  }
}
function docMsg(t, ok) {
  const m = $('docMsg');
  m.textContent = t;
  m.style.color = ok === false ? '#ff8a8a' : '#16a34a';
  setTimeout(() => {
    if (m.textContent === t) m.textContent = '';
  }, 4000);
}
qsaBtn(document, '.doc-tabs button').forEach(
  (b) =>
    (b.onclick = async () => {
      if (docDirty && !(await confirmAsync('当前修改未保存,切换文件将丢弃。继续?'))) return;
      document.querySelectorAll('.doc-tabs button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      docCur = b.dataset.f;
      docDirty = false;
      byIdBtn('docSave').disabled = true;
      loadDocs();
    })
);
byIdBtn('docSave').onclick = async () => {
  if (!docDirty || !(await confirmAsync('确定保存并立即对访客生效?'))) return;
  byIdBtn('docSave').disabled = true;
  try {
    const body = byIdFrame('docFrame').contentDocument.body.innerHTML;
    const r = await adminFetch('/api/admin/docs' + tk(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: docCur, content: docHead + body + docTail }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '保存失败');
    docDirty = false;
    byIdBtn('docSave').disabled = true;
    loadDocBaks();
    docMsg('已保存并生效(备份:' + d.backup + ')');
  } catch (e) {
    byIdBtn('docSave').disabled = false;
    docMsg(e.message, false);
  }
};
byIdBtn('docReload').onclick = async () => {
  if (!docDirty || (await confirmAsync('放弃当前修改,重新加载?'))) {
    docDirty = false;
    byIdBtn('docSave').disabled = true;
    loadDocs();
  }
};
async function loadDocBaks() {
  try {
    const d = await (
      await adminFetch('/api/admin/docs?backups=' + encodeURIComponent(docCur) + tk2())
    ).json();
    byIdSelect('docBak').innerHTML =
      '<option value="">选择备份回滚…</option>' +
      d.backups.map((b) => '<option>' + b + '</option>').join('');
    byIdBtn('docRestore').disabled = true;
  } catch (e) {
    // 原:静默吞掉 → 下拉空白,管理员误以为无备份可回滚
    byIdSelect('docBak').innerHTML = '<option value="">备份列表加载失败</option>';
    docMsg('备份列表加载失败:' + (e.message || e), false);
  }
}
byIdSelect('docBak').onchange = () => {
  byIdBtn('docRestore').disabled = !byIdSelect('docBak').value;
};
byIdBtn('docRestore').onclick = async () => {
  if (
    !byIdSelect('docBak').value ||
    !(await confirmAsync('回滚到 ' + byIdSelect('docBak').value + ' ?(会先自动备份当前版)'))
  )
    return;
  try {
    const r = await adminFetch('/api/admin/docs' + tk(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: docCur, restore: byIdSelect('docBak').value }),
    });
    if (!r.ok) throw new Error((await r.json()).error || '回滚失败');
    docDirty = false;
    byIdBtn('docSave').disabled = true;
    docMsg('已回滚');
    loadDocs();
  } catch (e) {
    docMsg(e.message, false);
  }
};
