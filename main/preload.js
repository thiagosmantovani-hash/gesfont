const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('gesfont', {
  getState: invoke('state:get'),
  chooseFolders: invoke('folders:choose'),
  removeFolder: invoke('folders:remove'),
  rescan: invoke('folders:rescan'),
  chooseRoot: invoke('root:choose'),
  openRoot: invoke('root:open'),
  importPaths: invoke('files:import'),
  chooseFiles: invoke('files:choose'),
  fileInfo: invoke('files:info'),
  mkdir: invoke('rootfs:mkdir'),
  renameFolder: invoke('rootfs:rename'),
  trashFolder: invoke('rootfs:trash'),
  moveInto: invoke('rootfs:move'),
  checkUpdate: invoke('update:check'),
  installUpdate: invoke('update:install'),
  respondUpdate: invoke('update:respond'),
  moveToApplications: invoke('app:moveToApplications'),
  refreshLogin: invoke('app:login'),
  trash: invoke('files:trash'),
  scanSystem: invoke('system:scan'),
  resolveSystem: invoke('system:resolve'),
  unkeepSystem: invoke('system:unkeep'),
  fontData: invoke('font:data'),
  fontDetails: invoke('font:details'),
  glyphInfo: invoke('font:glyph'),
  setActive: invoke('fonts:activate'),
  deactivateAll: invoke('fonts:deactivateAll'),
  exportFonts: invoke('fonts:export'),
  exportCollections: invoke('collections:export'),
  importCollections: invoke('collections:import'),
  save: invoke('data:save'),
  googleCatalog: invoke('google:catalog'),
  googleInstall: invoke('google:install'),
  reveal: invoke('shell:reveal'),
  openPath: invoke('shell:openPath'),
  openExternal: invoke('shell:open'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  on: (channel, fn) => {
    const allowed = ['library:changed', 'scan:progress', 'menu:navigate', 'menu:addFolder', 'menu:importFiles', 'menu:newCollection', 'menu:rescan', 'menu:find', 'menu:size', 'menu:layout', 'update:status', 'update:prompt'];
    if (!allowed.includes(channel)) return () => {};
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
