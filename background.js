let VERIFICATION_INTERVAL = 180 * 1000; // padrão 180 segundos = 3 minutos em ms
let lastDocumentCount = 0; // Substitui lastFilaVazia por lastDocumentCount
const TARGET_URL_BASE = "https://infoleg-sileg.camara.leg.br/autenticador/";
const TARGET_URL_COMPLETA = "https://infoleg-sileg.camara.leg.br/autenticador/#filaDocumento";
let isChecking = false;
let monitoredTabId = null;
let extensionEnabled = true;
let verificationInterval = null;
let lastPageUnavailableNotified = false;

/**
 * Função principal para verificar documentos na fila.
 */
async function checkNewDocuments() {
  if (!extensionEnabled) {
    console.log("Extensão desabilitada. Verificação pausada.");
    return;
  }

  if (isChecking) return;
  isChecking = true;
  try {
    const result = await isFilaVazia();
    const currentDocumentCount = result.count;
    console.log("Número atual de documentos (background):", currentDocumentCount);
    console.log("Número anterior de documentos (background):", lastDocumentCount);

    // Se a aba alvo não estiver aberta, notifica o usuário (apenas uma vez até reabrir)
    if (monitoredTabId === null) {
      if (!lastPageUnavailableNotified) {
  const popupWidth = 420;
  const popupHeight = 240;
        chrome.system.display.getInfo((displays) => {
          const primaryDisplay = displays[0];
          const screenWidth = primaryDisplay.workArea.width;
          const screenHeight = primaryDisplay.workArea.height;
          const left = Math.round((screenWidth - popupWidth) / 2);
          const top = Math.round((screenHeight - popupHeight) / 2);
          chrome.windows.create({
            url: 'popup.html?type=unavailable',
            type: 'popup',
            width: popupWidth,
            height: popupHeight,
            left: left,
            top: top,
            focused: true
          }, () => {
            console.log("Popup 'Página indisponível' exibido.");
          });
        });
        lastPageUnavailableNotified = true;
      }
      // Não prossegue com verificação de documentos quando a página não está aberta
      lastDocumentCount = 0;
      return;
    } else {
      // quando a página volta a estar disponível, reseta a flag
      lastPageUnavailableNotified = false;
    }

    // Dispara a notificação apenas se o número de documentos aumentou
    if (currentDocumentCount > lastDocumentCount && currentDocumentCount > 0) {
      const popupWidth = 500;
      const popupHeight = 260;

      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays[0];
        const screenWidth = primaryDisplay.workArea.width;
        const screenHeight = primaryDisplay.workArea.height;

        const left = Math.round((screenWidth - popupWidth) / 2);
        const top = Math.round((screenHeight - popupHeight) / 2);

        chrome.windows.create({
          url: 'popup.html?type=notification',
          type: 'popup',
          width: popupWidth,
          height: popupHeight,
          left: left,
          top: top,
          focused: true
        }, () => {
          console.log("Popup exibido no centro da tela!");
        });
      });
    }

    lastDocumentCount = currentDocumentCount;
  } catch (error) {
    console.error("Erro ao verificar documentos:", error);
  } finally {
    isChecking = false;
  }
}

/**
 * Verifica o estado da fila de documentos.
 * @returns {Promise<{state: string, count: number}>} Retorna o estado e o número de documentos.
 */
async function isFilaVazia() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: TARGET_URL_BASE + "*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const targetTab = tabs.find(tab => tab.url.includes('#filaDocumento'));
        if (targetTab) {
          console.log("Aba alvo encontrada. ID:", targetTab.id);
          monitoredTabId = targetTab.id;
          // tenta recarregar a aba monitorada antes de executar o content script
          chrome.tabs.reload(targetTab.id, { bypassCache: true }, () => {
            // Ignora erro de reload e tenta executar o content script em seguida
            chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              files: ['content.js']
            }).then(() => {
              chrome.tabs.sendMessage(targetTab.id, { action: "getDocumentState" }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error("Erro ao enviar mensagem ao content script:", chrome.runtime.lastError);
                  resolve({ state: 'empty', count: 0 });
                } else {
                  console.log("Resposta do content script:", response);
                  resolve(response || { state: 'empty', count: 0 });
                }
              });
            }).catch((error) => {
              console.error("Erro ao executar content.js:", error);
              resolve({ state: 'empty', count: 0 });
            });
          });
        } else {
          console.warn("Nenhuma aba com #filaDocumento encontrada.");
          monitoredTabId = null;
          resolve({ state: 'empty', count: 0 });
        }
      } else {
        console.warn("A página-alvo não está aberta.");
        monitoredTabId = null;
        resolve({ state: 'empty', count: 0 });
      }
    });
  });
}

/**
 * Inicia o loop de verificação
 */
function startVerificationLoop() {
  if (verificationInterval) {
    clearInterval(verificationInterval);
  }
  verificationInterval = setInterval(checkNewDocuments, VERIFICATION_INTERVAL);
}

/**
 * Para o loop de verificação
 */
function stopVerificationLoop() {
  if (verificationInterval) {
    clearInterval(verificationInterval);
    verificationInterval = null;
  }
}

/**
 * Listener para mensagens do popup.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFilaState') {
    sendResponse({ state: lastDocumentCount > 0 ? 'not_empty' : 'empty', count: lastDocumentCount });
  } else if (request.action === 'getMonitoredTabId') {
    sendResponse({ tabId: monitoredTabId });
  } else if (request.action === 'toggleExtension') {
    extensionEnabled = request.enabled;
    console.log("Extensão agora está:", extensionEnabled ? "Habilitada" : "Desabilitada");
    if (extensionEnabled) {
      startVerificationLoop();
    } else {
      stopVerificationLoop();
    }
    sendResponse({ success: true });
  } else if (request.action === 'setRefreshSeconds') {
    const seconds = request.seconds !== undefined ? Number(request.seconds) : 180;
    if (isNaN(seconds) || seconds <= 0) {
      sendResponse({ success: false, message: 'invalid_seconds' });
      return;
    }
    VERIFICATION_INTERVAL = seconds * 1000;
    chrome.storage.local.set({ refreshSeconds: seconds });
    if (extensionEnabled) {
      startVerificationLoop();
    }
    sendResponse({ success: true, seconds });
  }
});

/**
 * Inicia a verificação ao carregar a extensão
 */
chrome.runtime.onStartup.addListener(() => {
  console.log("Extensão iniciada. Iniciando loop de verificação.");
  chrome.storage.local.get(['extensionEnabled','refreshSeconds'], (result) => {
    extensionEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
    const seconds = result.refreshSeconds !== undefined ? Number(result.refreshSeconds) : 180;
    if (!isNaN(seconds) && seconds > 0) {
      VERIFICATION_INTERVAL = seconds * 1000;
    }
    if (extensionEnabled) {
      startVerificationLoop();
    }
  });
});

/**
 * Executa a verificação inicial quando a extensão é instalada ou atualizada.
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Extensão instalada/atualizada. Executando verificação inicial.");
  chrome.storage.local.get(['extensionEnabled','refreshSeconds'], (result) => {
    extensionEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
    const seconds = result.refreshSeconds !== undefined ? Number(result.refreshSeconds) : 180;
    if (!isNaN(seconds) && seconds > 0) {
      VERIFICATION_INTERVAL = seconds * 1000;
    }
    if (extensionEnabled) {
      checkNewDocuments();
      startVerificationLoop();
    }
  });
});