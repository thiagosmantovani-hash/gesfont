// Ajustes do app, organizados nas mesmas seções da referência.
import { h, icon, toggle, confirmBox, toast, fmt, debounce } from '../lib/ui.js';
import { S, api, saveSettings, reload, resetOverrides, emit, createCollection, saveCollections, DEFAULT_SAMPLES, samples, COLORS } from '../state.js';

export function mountSettings(root) {
  const page = h('div', { class: 'settings-page' });
  root.append(
    h('header', { class: 'view-head view-head-plain' }, h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Ajustes'))),
    h('div', { class: 'settings-scroll' }, page));

  const section = (title, desc, ...rows) => h('section', { class: 'set-section' }, h('h2', {}, title), desc ? h('p', { class: 'set-desc' }, desc) : null, ...rows);
  const row = (label, control, note) => h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('span', {}, label), note ? h('p', { class: 'set-desc' }, note) : null), control);
  const sw = (key, label, note, after) => row(label, toggle(S.settings[key] ? 'on' : 'off', () => { saveSettings({ [key]: !S.settings[key] }); if (after) after(); draw(); }, label), note);
  const select = (key, options, after) => h('select', { class: 'select set-select', onChange: (e) => { const v = isNaN(+e.target.value) ? e.target.value : +e.target.value; saveSettings({ [key]: v }); if (after) after(v); } },
    options.map(([v, l]) => h('option', { value: v, selected: String(S.settings[key]) === String(v) }, l)));

  function draw() {
    const mac = S.platform === 'darwin';
    const linux = S.platform === 'linux';
    const overrides = Object.keys(S.overrides).length;
    page.innerHTML = '';

    const samplesBox = h('textarea', { class: 'samples', rows: 7, spellcheck: 'false', onInput: debounce((e) => {
      const list = e.target.value.split('\n').map((t) => t.trim()).filter(Boolean);
      saveSettings({ samples: list.length ? list : null });
      S.previewText = samples()[0];
    }, 400) }, samples().join('\n'));

    page.append(
      section('Pasta principal', 'Os arquivos que você importa e as fontes baixadas do Google Fonts ficam aqui. Arraste fontes para esta pasta pelo Finder e elas aparecem no app. Ao trocar de pasta, os arquivos não são copiados e a pasta antiga não é apagada.',
        h('div', { class: 'set-path' },
          h('div', { class: 'path-field', title: S.rootDir }, S.rootDir),
          h('button', { class: 'btn', onClick: () => api.openRoot() }, mac ? 'Abrir no Finder' : 'Abrir'),
          h('button', { class: 'btn', onClick: async () => { const r = await api.chooseRoot(); if (r) { await reload(); toast('Pasta principal alterada'); draw(); } } }, 'Alterar…'))),

      section('Exibição das fontes', null,
        row('Tamanho padrão da prévia', select('previewSize', [16, 24, 32, 42, 48, 64, 80, 96, 120].map((n) => [n, n + ' px']), (v) => { S.size = v; emit('size'); })),
        row('Velocidade de rolagem da lista', select('scrollSpeed', [['slow', 'Lenta'], ['normal', 'Normal'], ['fast', 'Rápida']])),
        sw('groupFamilies', 'Agrupar fontes em famílias', 'Desligado, cada estilo aparece como um item separado na lista e na grade.', () => emit('data')),
        h('p', { class: 'set-desc' }, 'Para mudar o agrupamento de uma família, clique nela com o botão direito e escolha Renomear família ou Mesclar com outra família. Para desfazer todas essas mudanças e voltar aos nomes originais, use o botão abaixo.'),
        row('Restaurar nomes originais das famílias', h('button', { class: 'btn', disabled: !overrides, onClick: () => confirmBox('Restaurar os nomes originais?', `${fmt.plural(overrides, 'estilo volta', 'estilos voltam')} para a família original. Coleções e favoritas que usam os nomes novos podem precisar de ajuste.`, 'Restaurar', () => { resetOverrides(); toast('Nomes originais restaurados'); draw(); }) }, 'Restaurar'),
          overrides ? fmt.plural(overrides, 'estilo com nome alterado', 'estilos com nome alterado') : 'Nenhuma família alterada')),

      section('Textos de exemplo', 'Um texto por linha. A primeira linha é o texto padrão das prévias. Todos aparecem no menu de textos prontos.',
        samplesBox,
        h('div', { class: 'set-inline' }, h('button', { class: 'btn btn-sm', onClick: () => { saveSettings({ samples: null }); S.previewText = DEFAULT_SAMPLES[0]; draw(); } }, 'Restaurar textos padrão'))),

      section('Comportamento do app', null,
        sw('hideToTray', mac ? 'Manter na barra de menus ao fechar' : 'Manter na bandeja ao fechar', 'Fechar a janela deixa o GESFONT rodando, com um ícone para abrir de novo e desativar fontes.'),
        linux ? null : sw('openAtLogin', 'Iniciar com o sistema'),
        linux ? null : sw('startHidden', 'Iniciar oculto', 'Ao iniciar com o sistema, abre só o ícone, sem a janela.'),
        sw('deactivateOnQuit', 'Desativar todas as fontes ao sair', 'Mantém o sistema leve: cada projeto ativa só o que precisa.')),

      section('Aparência', null,
        row('Tema', h('div', { class: 'seg' }, [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) =>
          h('button', { class: 'seg-btn' + ((S.settings.theme || 'system') === v ? ' is-on' : ''), onClick: () => { saveSettings({ theme: v }); draw(); } }, l))))),

      section('Coleções', 'As coleções ficam neste computador. Exporte um arquivo para guardar uma cópia ou levar as coleções para outro Mac, e importe do outro lado.',
        row('Gerenciar coleções', h('div', { class: 'btn-row' },
          h('button', { class: 'btn', onClick: importCollections }, 'Importar'),
          h('button', { class: 'btn', disabled: !S.collections.length, onClick: async () => { const p = await api.exportCollections({ app: 'GESFONT', version: 1, exportedAt: new Date().toISOString(), collections: S.collections }); if (p) toast(`${fmt.plural(S.collections.length, 'coleção exportada', 'coleções exportadas')}`); } }, 'Exportar')),
          fmt.plural(S.collections.length, 'coleção', 'coleções'))),

      section('Tags', 'Tags automáticas vêm da classificação da fonte. Tags do Google Fonts vêm da categoria do catálogo. As suas tags, criadas pelo menu de cada família, continuam aparecendo.',
        sw('hideAutoTags', 'Ocultar tags automáticas', null, () => emit('tags')),
        sw('hideGoogleTags', 'Ocultar tags do Google Fonts', null, () => emit('tags'))),

      section('Atualizações', `Versão instalada: ${S.appVersion}. O GESFONT procura versões novas ao abrir e a cada seis horas, baixa em segundo plano e instala quando você reinicia o app.`,
        sw('autoUpdate', 'Atualizar automaticamente'),
        row('Procurar versão nova agora', h('button', { class: 'btn', onClick: () => api.checkUpdate() }, 'Verificar agora'), updateText())),

      section('Ativação', null,
        row('Onde as fontes são ativadas', h('button', { class: 'btn', onClick: () => api.openPath(S.targetDir) }, 'Abrir'), S.targetDir),
        row('Fontes ativas agora', h('button', { class: 'btn', disabled: !S.activated.size, onClick: async () => { await api.deactivateAll(); await reload(); toast('Todas as fontes foram desativadas'); draw(); } }, 'Desativar todas'),
          fmt.plural(S.activated.size, 'arquivo ativado pelo GESFONT', 'arquivos ativados pelo GESFONT')),
        row('Fontes do sistema', h('button', { class: 'btn', onClick: () => api.scanSystem() }, 'Ler novamente'), 'Leia de novo se instalou fontes por fora do GESFONT.')));
  }

  function updateText() {
    const u = S.update || {};
    return {
      dev: 'Disponível só no app instalado.', checking: 'Procurando…', latest: 'Você está na versão mais recente.',
      downloading: `Baixando a versão ${u.version}: ${u.percent || 0}%`, ready: `Versão ${u.version} pronta. Reinicie para instalar.`,
      available: `Versão ${u.version} disponível.`, manual: `Versão ${u.version} disponível para baixar.`,
      offline: 'Não foi possível consultar agora.', error: u.message || 'Erro ao verificar.',
    }[u.phase] || 'Ainda não verificado.';
  }

  async function importCollections() {
    const data = await api.importCollections();
    if (!data) return;
    let created = 0, merged = 0;
    for (const c of data.collections) {
      if (!c || !c.name || !Array.isArray(c.families)) continue;
      const same = S.collections.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
      if (same) { same.families = [...new Set([...same.families, ...c.families])]; merged++; }
      else { const n = createCollection(c.name, c.families); if (COLORS.includes(c.color)) n.color = c.color; created++; }
    }
    saveCollections();
    toast(created || merged ? `${fmt.plural(created, 'coleção criada', 'coleções criadas')}, ${fmt.plural(merged, 'atualizada', 'atualizadas')}` : 'O arquivo não tem coleções do GESFONT.', created || merged ? 'info' : 'error');
    draw();
  }

  draw();
  return { update: (reason) => { if ((reason === 'data' || reason === 'update') && !page.contains(document.activeElement)) draw(); }, destroy() {} };
}
