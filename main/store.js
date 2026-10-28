// Persistência simples em JSON dentro da pasta de dados do app.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  version: 1,
  folders: [],            // pastas monitoradas
  faces: {},              // id -> descrição da face (estilo) de fonte
  fileIndex: {},          // caminho -> { mtime, size, ids: [] }
  activated: {},          // caminho do arquivo original -> { dest, at, regName? }
  collections: [],        // { id, name, color, families: [familyKey] }
  favorites: [],          // [familyKey]
  pairs: [],              // { id, heading: familyKey, body: familyKey, at }
  overrides: {},          // faceId -> nome de família definido pelo usuário (mesclar, renomear)
  tags: {},               // familyKey -> [tag]
  settings: {
    theme: 'system',            // system | light | dark
    rootDir: '',                // pasta principal (padrão ~/GESFONT)
    deactivateOnQuit: false,
    hideToTray: false,
    autoUpdate: true,
    openAtLogin: false,
    startHidden: false,
    previewSize: 48,
    scrollSpeed: 'normal',      // slow | normal | fast
    groupFamilies: true,
    samples: null,              // textos de exemplo; null usa o padrão
    hideAutoTags: false,
    hideGoogleTags: false,
    view: 'list',               // list | grid
    systemScanned: false,
  },
};

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'gesfont.json');
    this.data = structuredClone(DEFAULTS);
    this._timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
    } catch {
      // primeiro uso ou arquivo corrompido: começa do zero, mantendo cópia do arquivo antigo
      if (fs.existsSync(this.file)) {
        try { fs.copyFileSync(this.file, this.file + '.bak'); } catch {}
      }
    }
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._timer);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
