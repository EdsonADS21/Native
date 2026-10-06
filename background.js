const abasTocando = new Set();
let filaSilencio = Promise.resolve();

async function aplicarSilencio() {
  const { modoSilencioso = false } = await chrome.storage.local.get('modoSilencioso');
  const { abasSilenciadas = {} } = await chrome.storage.session.get('abasSilenciadas');
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const native = /^https?:\/\/([\w-]+\.)*native-infinity\.com\.br\//.test(tab.url || '');
    try {
      if (modoSilencioso && native) {
        if (!(tab.id in abasSilenciadas)) {
          abasSilenciadas[tab.id] = !!tab.mutedInfo?.muted;
          await chrome.storage.session.set({ abasSilenciadas });
        }
        await chrome.tabs.update(tab.id, { muted: true });
      } else if (tab.id in abasSilenciadas) {
        await chrome.tabs.update(tab.id, { muted: abasSilenciadas[tab.id] });
        delete abasSilenciadas[tab.id];
      }
    } catch { delete abasSilenciadas[tab.id]; }
  }
  for (const id of Object.keys(abasSilenciadas)) {
    if (!tabs.some(tab => String(tab.id) === id)) delete abasSilenciadas[id];
  }
  await chrome.storage.session.set({ abasSilenciadas });
}

function sincronizarSilencio(alternar = false) {
  filaSilencio = filaSilencio.then(async () => {
    if (alternar) {
      const { modoSilencioso = false } = await chrome.storage.local.get('modoSilencioso');
      await chrome.storage.local.set({ modoSilencioso: !modoSilencioso });
    }
    await aplicarSilencio();
  }).catch(console.error);
  return filaSilencio;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.modoSilencioso) sincronizarSilencio();
});
sincronizarSilencio();

async function atenderLigacao() {
  const ids = abasTocando.size
    ? [...abasTocando]
    : (await chrome.tabs.query({ url: "*://*.native-infinity.com.br/*" })).map(tab => tab.id);
  const resultados = await Promise.all(ids.map(async tabId => {
    try {
      const resposta = await chrome.tabs.sendMessage(tabId, { action: "executar_clique_f4" });
      return resposta?.atendido === true;
    } catch {
      abasTocando.delete(tabId);
      return false;
    }
  }));
  if (resultados.some(Boolean)) {
    notificarTodasAsAbas({ action: "remover_modal_chamada" });
  }
}

chrome.tabs.onRemoved.addListener(tabId => abasTocando.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") abasTocando.delete(tabId);
  if (info.status === 'loading' || info.status === 'complete' || info.url) sincronizarSilencio();
});

function enviarParaAba(tabId, mensagem) {
  chrome.tabs.sendMessage(tabId, mensagem).catch(() => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    }).then(() => {
      chrome.tabs.sendMessage(tabId, mensagem).catch(() => {});
    }).catch(() => {});
  });
}

function notificarTodasAsAbas(mensagem) {
  chrome.tabs.query({}, (tabs) => {
    if (!tabs) return;
    tabs.forEach((tab) => {
      if (tab.id && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("brave://") && !tab.url.startsWith("edge://")) {
        enviarParaAba(tab.id, mensagem);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'alternar_modo_silencioso') {
    sincronizarSilencio(true).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (request.action === 'configurar_atalhos') {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    return;
  }
  if (request.action === "notificar_ligacao_tocando") {
    if (sender.tab?.id != null) abasTocando.add(sender.tab.id);
    notificarTodasAsAbas({ action: "exibir_modal_chamada" });
  } else if (request.action === "notificar_ligacao_encerrada") {
    abasTocando.delete(sender.tab?.id);
    if (!abasTocando.size) notificarTodasAsAbas({ action: "remover_modal_chamada" });
  } else if (request.action === "atender_ligacao_pelo_modal") {
    atenderLigacao().catch(() => {});
  } else if (request.action === "mudo_estado_atualizado") {
    chrome.action.setBadgeBackgroundColor({ color: request.mutado ? "#dc2626" : "#16a34a" });
    chrome.action.setBadgeText({ text: request.mutado ? "MUDO" : "" });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'alternar-modo-silencioso') {
    sincronizarSilencio(true);
    return;
  }
  if (command === "disparar-atendimento-global") {
    atenderLigacao().catch(() => {});
    return;
  }
  chrome.tabs.query({ url: "*://*.native-infinity.com.br/*" }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    
    if (command === "alternar-mudo-microfone") {
      tabs.forEach((tab) => chrome.tabs.sendMessage(tab.id, { action: "alternar_mudo_microfone" }).catch(() => {}));
    }
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes("native-infinity.com.br")) {
    chrome.tabs.sendMessage(tab.id, { action: "alternar_mudo_microfone" }).catch(() => {});
  } else {
    chrome.tabs.query({ url: "*://*.native-infinity.com.br/*" }, (tabs) => {
      tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action: "alternar_mudo_microfone" }).catch(() => {}));
    });
  }
});
