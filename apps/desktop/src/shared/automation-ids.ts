/** Stable UI automation contract shared by Renderer components and Playwright workflows. */
export const AUTOMATION_IDS = {
  app: {
    root: 'app.root',
    main: 'app.main',
    statusbar: 'app.statusbar',
  },
  shell: {
    navigation: 'shell.navigation',
    sidebarToggle: 'shell.sidebar.toggle',
    workspace: {
      capture: 'shell.workspace.capture',
      rules: 'shell.workspace.rules',
      composer: 'shell.workspace.composer',
      breakpoints: 'shell.workspace.breakpoints',
      diagnostics: 'shell.workspace.diagnostics',
      settings: 'shell.workspace.settings',
    },
    window: {
      minimize: 'shell.window.minimize',
      maximizeRestore: 'shell.window.maximize-restore',
      close: 'shell.window.close',
    },
    theme: {
      trigger: 'shell.theme.trigger',
      warm: 'shell.theme.warm',
      light: 'shell.theme.light',
      ember: 'shell.theme.ember',
      dark: 'shell.theme.dark',
    },
    language: {
      trigger: 'shell.language.trigger',
      en: 'shell.language.en',
      zhCN: 'shell.language.zh-CN',
      zhTW: 'shell.language.zh-TW',
      ja: 'shell.language.ja',
      ko: 'shell.language.ko',
      de: 'shell.language.de',
      fr: 'shell.language.fr',
      es: 'shell.language.es',
      it: 'shell.language.it',
      ptBR: 'shell.language.pt-BR',
      ru: 'shell.language.ru',
      nl: 'shell.language.nl',
      pl: 'shell.language.pl',
      tr: 'shell.language.tr',
      uk: 'shell.language.uk',
    },
    boot: {
      screen: 'shell.boot.screen',
      retry: 'shell.boot.retry',
      enterAnyway: 'shell.boot.enter-anyway',
      openDiagnostics: 'shell.boot.open-diagnostics',
    },
  },
  capture: {
    recordingToggle: 'capture.recording.toggle',
    keywordFilter: 'capture.filter.keyword',
    clearSearch: 'capture.filter.clear-search',
    filtersToggle: 'capture.filters.toggle',
    filterPanelSplitter: 'capture.filters.splitter',
    clearFilters: 'capture.filter.clear',
    filterOption: {
      application: 'capture.filter.option.application',
      method: 'capture.filter.option.method',
      host: 'capture.filter.option.host',
      status: 'capture.filter.option.status',
      protocol: 'capture.filter.option.protocol',
      type: 'capture.filter.option.type',
      rule: 'capture.filter.option.rule',
    },
    queryParams: 'capture.query-params',
    breakpointManager: 'capture.breakpoint-manager',
    enableMitm: 'capture.enable-mitm',
    clear: 'capture.clear',
    importMenu: 'capture.import-menu',
    exportMenu: 'capture.export-menu',
    importHar: 'capture.transfer.har-import',
    openArchive: 'capture.transfer.archive-open',
    exportHar: 'capture.transfer.har-export',
    saveArchive: 'capture.transfer.archive-save',
    transfer: {
      dialog: 'capture.transfer.dialog',
      scopeAll: 'capture.transfer.scope.all',
      scopeFilter: 'capture.transfer.scope.filter',
      scopeSelected: 'capture.transfer.scope.selected',
      maskAuthorization: 'capture.transfer.mask-authorization',
      maskCookies: 'capture.transfer.mask-cookies',
      stripBodies: 'capture.transfer.strip-bodies',
      start: 'capture.transfer.start',
      cancel: 'capture.transfer.cancel',
      close: 'capture.transfer.close',
      headerClose: 'capture.transfer.header-close',
    },
    inspector: {
      splitter: 'capture.inspector.splitter',
      close: 'capture.inspector.close',
      tab: {
        headers: 'capture.inspector.tab.headers',
        request: 'capture.inspector.tab.request',
        response: 'capture.inspector.tab.response',
        timing: 'capture.inspector.tab.timing',
        cookies: 'capture.inspector.tab.cookies',
        tls: 'capture.inspector.tab.tls',
        messages: 'capture.inspector.tab.messages',
        grpc: 'capture.inspector.tab.grpc',
        tunnel: 'capture.inspector.tab.tunnel',
      },
      bodyMode: {
        default: 'capture.inspector.body-mode.default',
        tree: 'capture.inspector.body-mode.tree',
        raw: 'capture.inspector.body-mode.raw',
        hex: 'capture.inspector.body-mode.hex',
      },
      setupHttps: 'capture.inspector.setup-https',
    },
    readiness: {
      close: 'capture.readiness.close',
      cancel: 'capture.readiness.cancel',
      openProxySettings: 'capture.readiness.open-proxy-settings',
      enable: 'capture.readiness.enable',
    },
    httpsSetup: {
      generate: 'capture.https-setup.generate',
      install: 'capture.https-setup.install',
      startDecrypting: 'capture.https-setup.start-decrypting',
      cancel: 'capture.https-setup.cancel',
      close: 'capture.https-setup.close',
    },
    websocket: {
      directionAll: 'capture.websocket.direction.all',
      directionSent: 'capture.websocket.direction.sent',
      directionReceived: 'capture.websocket.direction.received',
      pauseOnMessage: 'capture.websocket.pause-on-message',
    },
    grpc: {
      requestSide: 'capture.grpc.side.request',
      responseSide: 'capture.grpc.side.response',
    },
  },
  rules: {
    list: 'rules.list',
    search: 'rules.search',
    create: 'rules.create',
    createFolder: 'rules.create-folder',
    exportRules: 'rules.export',
    apply: 'rules.apply',
    reload: 'rules.reload',
    more: 'rules.more',
    delete: 'rules.delete',
    addCondition: 'rules.add-condition',
    addAction: 'rules.add-action',
    editorName: 'rules.editor.name',
    editorEnabled: 'rules.editor.enabled',
    showMatchingRequests: 'rules.show-matching-requests',
    conditionOption: {
      method: 'rules.condition.method',
      host: 'rules.condition.host',
      path: 'rules.condition.path',
      url: 'rules.condition.url',
      query: 'rules.condition.query',
      header: 'rules.condition.header',
      status: 'rules.condition.status',
      mime: 'rules.condition.mime',
    },
    actionOption: {
      header: 'rules.action.header',
      query: 'rules.action.query',
      body: 'rules.action.body',
      status: 'rules.action.status',
      synthetic: 'rules.action.synthetic',
      mapLocal: 'rules.action.map-local',
      mapRemote: 'rules.action.map-remote',
      block: 'rules.action.block',
      delay: 'rules.action.delay',
      breakpoint: 'rules.action.breakpoint',
    },
  },
  composer: {
    method: 'composer.method',
    url: 'composer.url',
    send: 'composer.send',
    history: 'composer.history',
    createNew: 'composer.new',
    collection: 'composer.collection',
    collectionTree: 'composer.collection.tree',
    collectionSplitter: 'composer.collection-splitter',
    newFolder: 'composer.collection.new-folder',
    newRequest: 'composer.collection.new-request',
    exportCollection: 'composer.collection.export',
    collectionSearch: 'composer.collection.search',
    toggleCollection: 'composer.collection.toggle',
    protocol: {
      auto: 'composer.protocol.auto',
      h1: 'composer.protocol.h1',
      h2: 'composer.protocol.h2',
    },
    tab: {
      headers: 'composer.tab.headers',
      query: 'composer.tab.query',
      body: 'composer.tab.body',
      auth: 'composer.tab.auth',
    },
    bodyType: 'composer.body-type',
    addHeader: 'composer.header.add',
    addQuery: 'composer.query.add',
    body: 'composer.body',
    authType: 'composer.auth.type',
    bearerToken: 'composer.auth.bearer-token',
    username: 'composer.auth.username',
    password: 'composer.auth.password',
    splitter: 'composer.splitter',
    responseTab: {
      body: 'composer.response-tab.body',
      headers: 'composer.response-tab.headers',
      cookies: 'composer.response-tab.cookies',
      timing: 'composer.response-tab.timing',
    },
    responseBodyMode: 'composer.response-body-mode',
  },
  breakpoints: {
    toggle: 'breakpoints.toggle',
    addHeader: 'breakpoints.header.add',
    body: 'breakpoints.body',
    drop: 'breakpoints.drop',
    continueUnmodified: 'breakpoints.continue-unmodified',
    executeEdited: 'breakpoints.execute-edited',
  },
  diagnostics: {
    processFilter: 'diagnostics.filter.process',
    levelFilter: 'diagnostics.filter.level',
    outcomeFilter: 'diagnostics.filter.outcome',
    export: 'diagnostics.export',
    loadEarlier: 'diagnostics.load-earlier',
    splitter: 'diagnostics.splitter',
  },
  settings: {
    section: {
      proxy: 'settings.section.proxy',
      certificates: 'settings.section.certificates',
      appearance: 'settings.section.appearance',
      storage: 'settings.section.storage',
      privacy: 'settings.section.privacy',
      updates: 'settings.section.updates',
    },
    proxy: {
      enable: 'settings.proxy.enable',
      restore: 'settings.proxy.restore',
    },
    certificates: {
      generate: 'settings.certificates.generate',
      delete: 'settings.certificates.delete',
      reveal: 'settings.certificates.reveal',
      install: 'settings.certificates.install',
      uninstall: 'settings.certificates.uninstall',
      mitmToggle: 'settings.certificates.mitm-toggle',
      insecureHostInput: 'settings.certificates.insecure-host-input',
      insecureHostAdd: 'settings.certificates.insecure-host-add',
    },
    storage: {
      refresh: 'settings.storage.refresh',
      clear: 'settings.storage.clear',
      clearCancel: 'settings.storage.clear-cancel',
      clearConfirm: 'settings.storage.clear-confirm',
    },
    privacy: {
      maskAuthorization: 'settings.privacy.mask-authorization',
      maskCookies: 'settings.privacy.mask-cookies',
      warnUnmasked: 'settings.privacy.warn-unmasked',
    },
    updates: {
      githubSignIn: 'settings.updates.github-sign-in',
      deviceCode: 'settings.updates.device-code',
      openGitHub: 'settings.updates.open-github',
      githubSignOut: 'settings.updates.github-sign-out',
      githubRetry: 'settings.updates.github-retry',
      check: 'settings.updates.check',
      download: 'settings.updates.download',
      openInstaller: 'settings.updates.open-installer',
    },
  },
} as const;

/** Stable prefixes for Core-owned rows whose full IDs are only known at runtime. */
export const AUTOMATION_ID_PREFIXES = {
  captureRequestRow: 'capture.request-row.',
  websocketFrame: 'capture.websocket.frame.',
  grpcMessage: 'capture.grpc.message.',
  ruleRow: 'rules.row.',
  ruleFolderRow: 'rules.folder-row.',
  composerCollectionRequest: 'composer.collection.request.',
  composerCollectionFolder: 'composer.collection.folder.',
  breakpointRow: 'breakpoints.row.',
  diagnosticRow: 'diagnostics.row.',
} as const;

/** Dynamic automation IDs for data-backed rows whose identity comes from Core. */
export class AutomationIdFactory {
  /** Identify one captured exchange row by its stable Core exchange ID. */
  static captureRequestRow(exchangeId: string): string {
    return `${AUTOMATION_ID_PREFIXES.captureRequestRow}${exchangeId}`;
  }

  /** Identify one request-derived Rule action in the row context menu. */
  static captureCreateRule(exchangeId: string, actionType: string): string {
    return `capture.create-rule.${exchangeId}.${actionType}`;
  }

  /** Identify one captured WebSocket frame by exchange and sequence. */
  static websocketFrame(exchangeId: string, sequence: number): string {
    return `${AUTOMATION_ID_PREFIXES.websocketFrame}${exchangeId}.${sequence}`;
  }

  /** Identify payload copy for one captured WebSocket frame. */
  static websocketPayloadCopy(exchangeId: string, sequence: number): string {
    return `capture.websocket.copy.${exchangeId}.${sequence}`;
  }

  /** Identify one captured gRPC message by exchange, side and message index. */
  static grpcMessage(exchangeId: string, side: string, index: number): string {
    return `${AUTOMATION_ID_PREFIXES.grpcMessage}${exchangeId}.${side}.${index}`;
  }

  /** Identify payload copy for one captured gRPC message. */
  static grpcPayloadCopy(exchangeId: string, side: string, index: number): string {
    return `capture.grpc.copy.${exchangeId}.${side}.${index}`;
  }

  /** Identify one editable rule row by its stable rule ID. */
  static ruleRow(ruleId: string): string {
    return `${AUTOMATION_ID_PREFIXES.ruleRow}${ruleId}`;
  }

  /** Identify the enable switch owned by one rule. */
  static ruleToggle(ruleId: string): string {
    return `rules.toggle.${ruleId}`;
  }

  /** Identify one Rule folder row by its stable folder ID. */
  static ruleFolderRow(folderId: string): string {
    return `${AUTOMATION_ID_PREFIXES.ruleFolderRow}${folderId}`;
  }

  /** Identify the expand/collapse control owned by one Rule folder. */
  static ruleFolderToggle(folderId: string): string {
    return `rules.folder-toggle.${folderId}`;
  }

  /** Identify the action-menu trigger owned by one Rule folder. */
  static ruleFolderMenu(folderId: string): string {
    return `rules.folder-menu.${folderId}`;
  }

  /** Identify one action in a Rule tree row's context menu. */
  static ruleNodeAction(nodeId: string, action: string): string {
    return `rules.node-action.${nodeId}.${action}`;
  }

  /** Identify the inline rename field owned by one Rule folder. */
  static ruleFolderRename(folderId: string): string {
    return `rules.folder-rename.${folderId}`;
  }

  /** Identify one matcher editor control by rule, index and field. */
  static ruleMatcherField(ruleId: string, index: number, field: string): string {
    return `rules.matcher.${ruleId}.${index}.${field}`;
  }

  /** Identify one action editor control by rule, index and field. */
  static ruleActionField(ruleId: string, index: number, field: string): string {
    return `rules.action.${ruleId}.${index}.${field}`;
  }

  /** Identify one saved Composer request row. */
  static composerCollectionRequest(requestId: string): string {
    return `${AUTOMATION_ID_PREFIXES.composerCollectionRequest}${requestId}`;
  }

  /** Identify one Composer Collection folder row. */
  static composerCollectionFolder(folderId: string): string {
    return `${AUTOMATION_ID_PREFIXES.composerCollectionFolder}${folderId}`;
  }

  /** Identify the expand/collapse control owned by a Collection folder. */
  static composerCollectionFolderToggle(folderId: string): string {
    return `composer.collection.folder-toggle.${folderId}`;
  }

  /** Identify the create-target control owned by a Collection folder. */
  static composerCollectionFolderTarget(folderId: string): string {
    return `composer.collection.folder-target.${folderId}`;
  }

  /** Identify the action-menu trigger owned by a Collection folder. */
  static composerCollectionFolderMenu(folderId: string): string {
    return `composer.collection.folder-menu.${folderId}`;
  }

  /** Identify one action in a Collection tree row's context menu. */
  static composerCollectionNodeAction(nodeId: string, action: string): string {
    return `composer.collection.node-action.${nodeId}.${action}`;
  }

  /** Identify the inline rename field owned by a Collection folder. */
  static composerCollectionFolderRename(folderId: string): string {
    return `composer.collection.folder-rename.${folderId}`;
  }

  /** Identify one Composer history row by its local history ID. */
  static composerHistoryRow(historyId: string): string {
    return `composer.history-row.${historyId}`;
  }

  /** Identify one Composer header control by row and field. */
  static composerHeaderField(headerId: string, field: string): string {
    return `composer.header.${headerId}.${field}`;
  }

  /** Identify one Composer query control by row index and field. */
  static composerQueryField(index: number, field: string): string {
    return `composer.query.${index}.${field}`;
  }

  /** Identify one pending breakpoint row by its stable breakpoint ID. */
  static breakpointRow(breakpointId: string): string {
    return `${AUTOMATION_ID_PREFIXES.breakpointRow}${breakpointId}`;
  }

  /** Identify one editable breakpoint header control by row and field. */
  static breakpointHeaderField(headerId: string, field: string): string {
    return `breakpoints.header.${headerId}.${field}`;
  }

  /** Identify one diagnostics command row by its aggregate trace key. */
  static diagnosticRow(traceKey: string): string {
    return `${AUTOMATION_ID_PREFIXES.diagnosticRow}${traceKey}`;
  }

  /** Identify removal of one configured TLS exception host. */
  static insecureHostRemove(host: string): string {
    return `settings.certificates.insecure-host-remove.${host}`;
  }
}

export type AutomationId = string;
