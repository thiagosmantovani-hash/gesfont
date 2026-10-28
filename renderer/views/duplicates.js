// Gestão de duplicadas: estilos repetidos em arquivos diferentes e famílias com nomes quase iguais.
import { h, icon, confirmBox, fmt, toast } from '../lib/ui.js';
import { applyFace } from '../lib/fonts.js';
import { S, api, duplicateGroups, recommended, similarFamilies, trashPaths, setFamilyName, navigate } from '../state.js';

const SOURCE_LABEL = { local: 'Pasta adicionada', imported: 'Pasta GESFONT', google: 'Google Fonts', system: 'Sistema' };
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function mountDuplicates(root) {
  let tab = 'files';
  const info = new Map(); // caminho -> { hash, mtime }
  const body = h('div', { class: 'dup-body' });
  const countEl = h('span', { class: 'view-count' });
  const actions = h('div', { class: 'view-actions' });
  const tabs = h('nav', { class: 'tabs tabs-flush', role: 'tablist' });
  root.append(
    h('header', { class: 'view-head view-head-tabs' },
      h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Duplicadas'), countEl, actions),
      h('p', { class: 'view-sub' }, 'Arquivos movidos para a Lixeira saem do GESFONT e podem ser recuperados pela Lixeira do sistema. Fontes do sistema não são apagadas.'),
      tabs),
    body);

  async function loadInfo(groups) {
    const missing = [...new Set(groups.flatMap((g) => g.faces.map((f) => f.path)))].filter((p) => !info.has(p));
    if (!missing.length) return;
    const r = await api.fileInfo(missing);
    for (const [p, v] of Object.entries(r)) info.set(p, v);
  }

  function drawTabs(groups, similar) {
    tabs.innerHTML = '';
    for (const [id, label, n] of [['files', 'Estilos repetidos', groups.length], ['families', 'Famílias para mesclar', similar.length]]) {
      tabs.append(h('button', { class: 'tab' + (tab === id ? ' is-on' : ''), role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', onClick: () => { tab = id; draw(); } }, label, n ? h('span', { class: 'tab-count' }, fmt.int(n)) : null));
    }
  }

  function entry(face, group, keep) {
    const meta = info.get(face.path);
    const identical = meta && group.faces.filter((f) => info.get(f.path)?.hash === meta.hash).length > 1;
    const sample = h('span', { class: 'dup-sample' }, 'Aa');
    applyFace(sample, face);
    const others = group.faces.filter((f) => f.path !== face.path);
    const deletable = face.source !== 'system';
    const othersDeletable = others.filter((f) => f.source !== 'system');
    const dir = face.path.replace(/[\\/][^\\/]+$/, '');
    return h('div', { class: 'dup-entry' + (face === keep ? ' is-keep' : '') },
      sample,
      h('div', { class: 'dup-info' },
        h('div', { class: 'dup-file' },
          h('strong', {}, face.path.split(/[\\/]/).pop()),
          face === keep ? h('span', { class: 'badge is-strong' }, 'Recomendado') : null,
          identical ? h('span', { class: 'badge' }, 'Arquivo idêntico') : null,
          S.activated.has(face.path) ? h('span', { class: 'badge' }, 'Ativa') : null),
        h('div', { class: 'dup-meta' },
          h('span', {}, face.version ? face.version.replace(/^Version\s*/i, 'Versão ') : 'Sem versão'),
          h('span', {}, face.format.toUpperCase()),
          h('span', {}, fmt.bytes(face.fileSize)),
          face.mtime || meta?.mtime ? h('span', {}, 'Modificado em ' + dateFmt.format(new Date(face.mtime || meta.mtime))) : null,
          h('span', {}, SOURCE_LABEL[face.source] || '')),
        h('button', { class: 'link dup-path', title: 'Mostrar no Finder', onClick: () => api.reveal(face.path) }, dir)),
      h('div', { class: 'dup-actions' },
        othersDeletable.length ? h('button', { class: 'btn btn-sm', onClick: () => confirmBox('Manter só este arquivo?',
          `${fmt.plural(othersDeletable.length, 'outro arquivo vai', 'outros arquivos vão')} para a Lixeira.`, 'Manter este', () => trashPaths(othersDeletable.map((f) => f.path))) }, 'Manter este') : null,
        deletable && others.length ? h('button', { class: 'icon-btn', title: 'Mover para a Lixeira', 'aria-label': 'Mover para a Lixeira', onClick: () => confirmBox('Mover este arquivo para a Lixeira?', face.path, 'Mover para a Lixeira', () => trashPaths([face.path])) }, icon('trash')) : null));
  }

  function drawFiles(groups) {
    if (!groups.length) {
      body.append(h('div', { class: 'empty' }, h('h2', {}, 'Nenhuma duplicada'), h('p', {}, 'Nenhum estilo aparece em mais de um arquivo da sua biblioteca.')));
      return;
    }
    const list = h('div', { class: 'dup-list' });
    for (const g of groups) {
      const keep = recommended(g.faces);
      list.append(h('section', { class: 'dup-group' },
        h('div', { class: 'dup-head' },
          h('button', { class: 'dup-name', onClick: () => navigate('detail', g.family.toLowerCase()) }, g.name),
          h('span', { class: 'view-count' }, fmt.plural(g.faces.length, 'arquivo', 'arquivos'))),
        g.faces.slice().sort((a, b) => (b === keep) - (a === keep)).map((f) => entry(f, g, keep))));
    }
    body.append(list);
  }

  function drawFamilies(similar) {
    if (!similar.length) {
      body.append(h('div', { class: 'empty' }, h('h2', {}, 'Nenhuma família para mesclar'),
        h('p', {}, 'Não há famílias com nomes quase iguais. Para juntar quaisquer duas famílias, clique com o botão direito numa delas e escolha Mesclar com outra família.')));
      return;
    }
    const list = h('div', { class: 'dup-list' });
    for (const fams of similar) {
      list.append(h('section', { class: 'dup-group' },
        h('div', { class: 'dup-head' }, h('span', { class: 'dup-name' }, fams.map((f) => f.name).join(', '))),
        h('p', { class: 'muted small dup-note' }, 'Os nomes diferem só em espaços, hífens ou maiúsculas. Mesclar junta todos os estilos numa família só. Os arquivos não mudam.'),
        h('div', { class: 'merge-row' }, fams.map((target) => {
          const s = h('span', { class: 'merge-sample' }, target.name);
          applyFace(s, target.primary);
          return h('button', { class: 'merge-opt', onClick: () => {
            for (const f of fams) if (f !== target) setFamilyName(f, target.name);
            toast(`Famílias mescladas em ${target.name}`);
          } }, s, h('span', { class: 'merge-meta' }, `Mesclar em ${target.name}, ${fmt.plural(target.faces.length, 'estilo', 'estilos')}`));
        }))));
    }
    body.append(list);
  }

  async function draw() {
    const groups = duplicateGroups();
    const similar = similarFamilies();
    drawTabs(groups, similar);
    countEl.textContent = groups.length ? fmt.plural(groups.length, 'estilo repetido', 'estilos repetidos') : '';
    actions.innerHTML = '';
    const auto = groups.flatMap((g) => { const k = recommended(g.faces); return g.faces.filter((f) => f !== k && f.source !== 'system' && f.path !== k.path); });
    const autoPaths = [...new Set(auto.map((f) => f.path))];
    // um arquivo com outras faces (TTC) só é apagado se todas as faces dele forem duplicadas
    const safePaths = autoPaths.filter((p) => S.faces.filter((f) => f.path === p).every((f) => auto.includes(f)));
    if (tab === 'files' && safePaths.length) {
      actions.append(h('button', { class: 'btn btn-primary', onClick: () => confirmBox('Manter só as versões recomendadas?',
        `${fmt.plural(safePaths.length, 'arquivo vai', 'arquivos vão')} para a Lixeira. Em cada grupo fica o arquivo com a versão mais nova e em formato instalável. Quando são iguais, fica o original e a cópia sai.`,
        'Mover para a Lixeira', () => trashPaths(safePaths)) }, 'Resolver todas'));
    }
    await loadInfo(groups);
    body.innerHTML = '';
    if (tab === 'files') drawFiles(groups); else drawFamilies(similar);
  }

  draw();
  return { update: (reason) => { if (['data', 'busy'].includes(reason)) draw(); }, destroy() {} };
}
