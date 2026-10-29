// Verificação do sistema: fontes instaladas por fora do GESFONT, com uma decisão para cada família.
import { h, icon, modal, toast, fmt } from '../lib/ui.js';
import { applyFace } from '../lib/fonts.js';
import { S, api, installedFamilies, reload, navigate } from '../state.js';

const decisions = new Map(); // família -> { action: 'keep' | 'move' | 'trash', active: bool }
const ACTIONS = [['keep', 'Manter'], ['move', 'Mover para a GESFONT'], ['trash', 'Apagar']];
const tilde = (p) => p.replace(/^\/(Users|home)\/[^/]+/, '~');

export function mountReview(root) {
  let tab = 'pending';
  const body = h('div', { class: 'review-body' });
  const tabs = h('nav', { class: 'tabs tabs-flush', role: 'tablist' });
  const countEl = h('span', { class: 'view-count' });
  const foot = h('footer', { class: 'review-foot' });
  root.append(
    h('header', { class: 'view-head view-head-tabs' },
      h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Verificação do sistema'), countEl,
        h('div', { class: 'view-actions' }, h('button', { class: 'btn', onClick: () => api.scanSystem() }, icon('refresh'), 'Varrer de novo'))),
      h('p', { class: 'view-sub' }, 'O GESFONT varreu o computador. Estas fontes foram instaladas no sistema por você, por um instalador ou por um app. Elas ficam ativas o tempo todo, em todos os apps. Decida o que fazer com cada família e aplique no final. As fontes nativas ficam na aba Nativas e não aparecem aqui.'),
      tabs),
    body, foot);

  function draw() {
    const all = installedFamilies().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const pending = all.filter((f) => !f.kept);
    const kept = all.filter((f) => f.kept);
    countEl.textContent = all.length ? `${fmt.plural(all.length, 'família instalada', 'famílias instaladas')}` : '';
    tabs.innerHTML = '';
    for (const [id, label, n] of [['pending', 'Aguardando decisão', pending.length], ['kept', 'Mantidas', kept.length]]) {
      tabs.append(h('button', { class: 'tab' + (tab === id ? ' is-on' : ''), role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', onClick: () => { tab = id; draw(); } }, label, n ? h('span', { class: 'tab-count' }, fmt.int(n)) : null));
    }
    body.innerHTML = '';
    foot.innerHTML = '';
    foot.hidden = true;

    if (!S.settings.systemScanned || (S.scan && S.scan.folder === 'Sistema')) {
      body.append(h('div', { class: 'empty' }, h('h2', {}, 'Varrendo o sistema'), h('p', {}, 'Lendo todas as pastas de fontes do computador. A primeira vez leva alguns segundos.')));
      return;
    }
    const list = tab === 'pending' ? pending : kept;
    if (!list.length) {
      body.append(h('div', { class: 'empty' }, ...(tab === 'pending'
        ? [h('div', { class: 'review-done', 'aria-hidden': 'true' }, icon('shield')), h('h2', {}, all.length ? 'Tudo verificado' : 'Nenhuma fonte instalada por fora'),
          h('p', {}, all.length ? 'Todas as fontes instaladas no sistema já têm decisão. As que você manteve estão na aba Mantidas.' : 'Todas as fontes ativas do computador são nativas do sistema ou gerenciadas pelo GESFONT.'),
          h('button', { class: 'btn', onClick: () => navigate('native') }, 'Ver fontes nativas')]
        : [h('h2', {}, 'Nenhuma fonte mantida'), h('p', {}, 'As famílias que você decidir manter onde estão aparecem aqui.')])));
      return;
    }

    if (tab === 'pending') {
      body.append(h('div', { class: 'review-bulk' },
        h('span', { class: 'muted small' }, 'Para todas:'),
        ACTIONS.map(([a, l]) => h('button', { class: 'btn btn-sm', onClick: () => { for (const f of pending) decisions.set(f.key, { action: a, active: true }); draw(); } }, l)),
        h('button', { class: 'btn btn-sm btn-ghost', onClick: () => { for (const f of pending) decisions.delete(f.key); draw(); } }, 'Limpar decisões')));
    }

    const rows = h('div', { class: 'review-list' });
    for (const fam of list) rows.append(tab === 'pending' ? pendingRow(fam) : keptRow(fam));
    body.append(rows);

    if (tab === 'pending') drawFoot(pending);
  }

  function famInfo(fam) {
    const sample = h('span', { class: 'review-sample' }, fam.name);
    applyFace(sample, fam.primary);
    const dirs = [...new Set(fam.files.map((p) => p.replace(/[\\/][^\\/]+$/, '')))];
    return h('div', { class: 'review-info' },
      sample,
      h('div', { class: 'review-meta' },
        h('span', {}, fmt.plural(fam.faces.length, 'estilo', 'estilos')),
        h('span', {}, fmt.plural(fam.files.length, 'arquivo', 'arquivos')),
        h('span', {}, fam.where),
        fam.admin ? h('span', { class: 'badge', title: 'Instalada para todos os usuários. Mover ou apagar pede a senha do Mac.' }, icon('lock', 'badge-ico'), 'Pede senha') : null,
        fam.apple ? h('span', { class: 'badge', title: 'Instalada por um app da Apple. O recomendado é manter.' }, 'Da Apple') : null),
      h('button', { class: 'link review-path', title: 'Mostrar no Finder', onClick: () => api.reveal(fam.files[0]) }, dirs.map(tilde).join(', ')));
  }

  function pendingRow(fam) {
    const d = decisions.get(fam.key);
    const seg = h('div', { class: 'seg review-seg', role: 'radiogroup', 'aria-label': `Decisão para ${fam.name}` },
      ACTIONS.map(([a, l]) => h('button', {
        class: 'seg-btn' + (d && d.action === a ? ' is-on' : '') + (a === 'trash' ? ' is-trash' : ''), role: 'radio', 'aria-checked': d && d.action === a ? 'true' : 'false',
        onClick: () => { decisions.set(fam.key, { action: a, active: d ? d.active : true }); draw(); },
      }, l)));
    const activeBox = d && d.action === 'move'
      ? h('label', { class: 'review-check' }, h('input', { type: 'checkbox', checked: d.active !== false, onChange: (e) => { d.active = e.target.checked; drawFoot(installedFamilies().filter((f) => !f.kept)); } }), 'Continuar ativa')
      : null;
    return h('div', { class: 'review-row' + (d ? ' is-decided' : '') }, famInfo(fam), h('div', { class: 'review-decide' }, seg, activeBox));
  }

  function keptRow(fam) {
    return h('div', { class: 'review-row' }, famInfo(fam),
      h('div', { class: 'review-decide' }, h('button', { class: 'btn btn-sm', onClick: async () => { await api.unkeepSystem(fam.files); await reload(); tab = 'pending'; draw(); } }, 'Revisar de novo')));
  }

  function plan(pending) {
    const items = [];
    const count = { keep: 0, move: 0, trash: 0, admin: false };
    for (const fam of pending) {
      const d = decisions.get(fam.key);
      if (!d) continue;
      count[d.action]++;
      if (d.action !== 'keep' && fam.admin) count.admin = true;
      const action = d.action === 'move' ? (d.active !== false ? 'move-active' : 'move') : d.action;
      for (const p of fam.files) items.push({ path: p, action });
    }
    return { items, count };
  }

  function drawFoot(pending) {
    const { items, count } = plan(pending);
    foot.innerHTML = '';
    foot.hidden = false;
    const parts = [];
    if (count.move) parts.push(fmt.plural(count.move, 'para mover', 'para mover'));
    if (count.trash) parts.push(fmt.plural(count.trash, 'para apagar', 'para apagar'));
    if (count.keep) parts.push(fmt.plural(count.keep, 'para manter', 'para manter'));
    const undecided = pending.length - count.move - count.trash - count.keep;
    foot.append(
      h('div', { class: 'review-summary' },
        h('strong', {}, parts.length ? parts.join(', ') : 'Nenhuma decisão ainda'),
        h('span', { class: 'muted small' }, undecided ? `${fmt.plural(undecided, 'família continua', 'famílias continuam')} aguardando. Elas não mudam.` : 'Todas as famílias têm decisão.')),
      h('button', { class: 'btn btn-primary', disabled: !items.length, onClick: () => confirmApply(items, count) }, 'Aplicar decisões'));
  }

  function confirmApply(items, count) {
    const lines = [];
    if (count.move) lines.push(`${fmt.plural(count.move, 'família vai', 'famílias vão')} para a pasta GESFONT, em "Importadas do sistema". As marcadas com "Continuar ativa" seguem ativas, agora pelo GESFONT.`);
    if (count.trash) lines.push(`${fmt.plural(count.trash, 'família vai', 'famílias vão')} para a Lixeira. Dá para recuperar de lá.`);
    if (count.keep) lines.push(`${fmt.plural(count.keep, 'família fica', 'famílias ficam')} onde está e sai da lista de pendentes.`);
    if (count.admin) lines.push('Algumas fontes estão instaladas para todos os usuários. O Mac vai pedir a sua senha uma vez.');
    lines.push('Apps abertos podem precisar ser reiniciados para perceber a mudança.');
    modal('Aplicar decisões?', h('div', { class: 'stack' }, lines.map((l) => h('p', {}, l))), [
      { label: 'Cancelar', action: () => {} },
      { label: 'Aplicar', primary: true, action: () => { apply(items); } },
    ]);
  }

  async function apply(items) {
    foot.querySelector('.btn-primary')?.setAttribute('disabled', '');
    const r = await api.resolveSystem(items);
    decisions.clear();
    await reload();
    const parts = [];
    if (r.moved) parts.push(`${fmt.plural(r.moved, 'arquivo movido', 'arquivos movidos')} para a GESFONT`);
    if (r.trashed) parts.push(`${fmt.plural(r.trashed, 'arquivo', 'arquivos')} na Lixeira`);
    if (r.kept) parts.push(`${fmt.plural(r.kept, 'arquivo mantido', 'arquivos mantidos')}`);
    if (r.failed.length) {
      modal('Algumas fontes não mudaram', h('div', { class: 'stack' },
        h('p', {}, parts.length ? parts.join(', ') + '. ' : '', `${fmt.plural(r.failed.length, 'arquivo não pôde', 'arquivos não puderam')} ser alterado${r.failed.length === 1 ? '' : 's'}:`),
        h('ul', { class: 'fail-list' }, r.failed.slice(0, 12).map((f) => h('li', {}, h('strong', {}, tilde(f.path).split('/').pop()), ` ${f.message}`)))),
      [{ label: 'Entendi', primary: true, action: () => {} }]);
    } else toast(parts.join(', ') || 'Nada mudou');
    draw();
  }

  draw();
  return { update: (reason) => { if (['data', 'init'].includes(reason)) draw(); }, destroy() {} };
}
