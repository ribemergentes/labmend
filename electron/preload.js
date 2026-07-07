const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  db: {
    query: (sql,p) => ipcRenderer.invoke('db:query',sql,p),
    get:   (sql,p) => ipcRenderer.invoke('db:get',sql,p),
    run:   (sql,p) => ipcRenderer.invoke('db:run',sql,p),
    transaction: (ops) => ipcRenderer.invoke('db:transaction',ops),
  },
  email: {
    send: (opts) => ipcRenderer.invoke('email:send',opts),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal',url),
  },
  dialog: {
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile',opts),
    openFile: (opts) => ipcRenderer.invoke('dialog:openFile',opts),
  },
  fs: {
    writeFile: (opts)     => ipcRenderer.invoke('fs:writeFile',opts),
    readFile:  (filePath) => ipcRenderer.invoke('fs:readFile',filePath),
  },
  pdf: {
    save:        (opts) => ipcRenderer.invoke('pdf:save', opts),
    saveAndOpen: (opts) => ipcRenderer.invoke('pdf:saveAndOpen', opts),
  },
  catalog: {
    exportToFile:   (opts) => ipcRenderer.invoke('catalog:exportToFile', opts),
    importFromFile: ()     => ipcRenderer.invoke('catalog:importFromFile'),
  },
  app: {
    getVersion:      () => ipcRenderer.invoke('app:getVersion'),
    getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),
  },
  updater: {
    check:    ()   => ipcRenderer.invoke('update:check'),
    download: ()   => ipcRenderer.invoke('update:download'),
    install:  ()   => ipcRenderer.invoke('update:install'),
    onStatus: (cb) => {
      const handler = (_e, data) => cb(data)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    },
  },
  isElectron: true,
})
