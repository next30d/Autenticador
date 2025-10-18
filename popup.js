// Função para tocar o alarme
function playAlarm() {
  const alarmSound = document.getElementById('alarmSound');
  alarmSound.play().catch((error) => {
    console.error('Erro ao tocar o alarme:', error);
  });
}

// Função para obter parâmetros da URL
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Carrega os estados salvos e configura os ícones
window.addEventListener('DOMContentLoaded', () => {
  const toggleSoundButton = document.getElementById('toggleSound');
  const toggleExtensionButton = document.getElementById('toggleExtension');
  const soundIcon = toggleSoundButton.querySelector('img');
  const extensionIcon = toggleExtensionButton.querySelector('img');
  const settingsContainer = document.querySelector('.settings-container');
  const refreshButton = document.getElementById('refreshButton');
  const openSystemButton = document.getElementById('openSystem');
  const h1Element = document.querySelector('h1');

  // Verifica se é uma janela de notificação
  const isNotification = getQueryParam('type') === 'notification';
  const isUnavailable = getQueryParam('type') === 'unavailable';

  // Carrega o estado do som e da extensão
  chrome.storage.local.get(['soundEnabled', 'extensionEnabled'], (result) => {
    const soundEnabled = result.soundEnabled !== undefined ? result.soundEnabled : true;
    const extensionEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;

    // Atualiza os ícones com base nos estados
    soundIcon.src = soundEnabled ? 'speaker-on.png' : 'speaker-off.png';
    soundIcon.alt = soundEnabled ? 'Alarme Habilitado' : 'Alarme Desabilitado';
    extensionIcon.src = extensionEnabled ? 'on.png' : 'off.png';
    extensionIcon.alt = extensionEnabled ? 'Extensão Habilitada' : 'Extensão Desabilitada';

    // Oculta os ícones de configuração na janela de notificação
    if (isNotification) {
      settingsContainer.classList.add('hidden');
    }

    // Se for popup de página indisponível
    if (isUnavailable) {
      settingsContainer.classList.add('hidden');
      h1Element.textContent = 'Página indisponível';
      openSystemButton.style.display = 'none';
      return; // não precisa verificar fila
    }

    // Se a extensão estiver desabilitada e for a janela de configuração, exibe mensagem especial
    if (!extensionEnabled && !isNotification) {
      h1Element.textContent = 'Extensão desabilitada.';
      openSystemButton.style.display = 'none';
      return;
    }

    // Atualiza o title do botão de refresh com o valor atual em segundos
    chrome.storage.local.get(['refreshSeconds'], (r) => {
      const secs = r.refreshSeconds !== undefined ? r.refreshSeconds : 180;
      refreshButton.title = `Configurar refresh (atual: ${secs}s)`;
    });

    // Solicita o estado da fila
    chrome.runtime.sendMessage({ action: 'getFilaState' }, (response) => {
      if (response) {
        const message = response.state === 'empty'
          ? 'Sem documento na caixa.'
          : `Novo documento na caixa de entrada (${response.count} documento${response.count > 1 ? 's' : ''}).`;
        h1Element.textContent = message;

        // Toca o alarme se o som estiver habilitado, houver novos documentos e for uma janela de notificação
        if (soundEnabled && response.state === 'not_empty' && isNotification) {
          playAlarm();
        }
      }
    });
  });

  // Evento para habilitar/desabilitar o som
  toggleSoundButton.addEventListener('click', () => {
    chrome.storage.local.get(['soundEnabled'], (result) => {
      const soundEnabled = result.soundEnabled !== undefined ? result.soundEnabled : true;
      const newSoundState = !soundEnabled;
      chrome.storage.local.set({ soundEnabled: newSoundState }, () => {
        soundIcon.src = newSoundState ? 'speaker-on.png' : 'speaker-off.png';
        soundIcon.alt = newSoundState ? 'Alarme Habilitado' : 'Alarme Desabilitado';
      });
    });
  });

  // Evento para botão de refresh (definir intervalo em segundos)
  refreshButton.addEventListener('click', () => {
    chrome.storage.local.get(['refreshSeconds'], (result) => {
      const current = result.refreshSeconds !== undefined ? result.refreshSeconds : 180; // 180s = 3min
      const input = prompt('Intervalo de refresh em segundos (padrão 180):', String(current));
      if (input === null) return; // cancelado
      const seconds = parseInt(input, 10);
      if (isNaN(seconds) || seconds <= 0) {
        alert('Por favor informe um número inteiro positivo de segundos.');
        return;
      }
      chrome.storage.local.set({ refreshSeconds: seconds }, () => {
        // envia para o background atualizar o intervalo
        chrome.runtime.sendMessage({ action: 'setRefreshSeconds', seconds }, (resp) => {
          console.log('RefreshSeconds atualizado:', seconds, resp);
          alert('Intervalo de refresh salvo: ' + seconds + ' segundo(s)');
        });
      });
    });
  });

  // Evento para habilitar/desabilitar a extensão
  toggleExtensionButton.addEventListener('click', () => {
    chrome.storage.local.get(['extensionEnabled'], (result) => {
      const extensionEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
      const newExtensionState = !extensionEnabled;
      chrome.storage.local.set({ extensionEnabled: newExtensionState }, () => {
        extensionIcon.src = newExtensionState ? 'on.png' : 'off.png';
        extensionIcon.alt = newExtensionState ? 'Extensão Habilitada' : 'Extensão Desabilitada';
        chrome.runtime.sendMessage({ action: 'toggleExtension', enabled: newExtensionState }, () => {
          if (!newExtensionState) {
            h1Element.textContent = 'Extensão desabilitada.';
            openSystemButton.style.display = 'none';
          } else {
            h1Element.textContent = 'Verificando fila...';
            openSystemButton.style.display = 'block';
            chrome.runtime.sendMessage({ action: 'getFilaState' }, (response) => {
              if (response) {
                const message = response.state === 'empty'
                  ? 'Sem documento na caixa.'
                  : `Novo documento na caixa de entrada (${response.count} documento${response.count > 1 ? 's' : ''}).`;
                h1Element.textContent = message;
              }
            });
          }
        });
      });
    });
  });
});

// Evento para o botão "Autenticador"
document.getElementById('openSystem').addEventListener('click', function() {
  const targetUrl = 'https://infoleg-sileg.camara.leg.br/autenticador/#filaDocumento';
  
  chrome.tabs.query({ url: 'https://infoleg-sileg.camara.leg.br/autenticador/*' }, (tabs) => {
    const targetTab = tabs.find(tab => tab.url.includes('#filaDocumento'));
    
    if (targetTab) {
      chrome.tabs.update(targetTab.id, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error('Erro ao focar na aba:', chrome.runtime.lastError);
          alert('Não foi possível focar na aba do sistema. Tente novamente.');
        } else {
          chrome.windows.update(targetTab.windowId, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              console.error('Erro ao focar na janela:', chrome.runtime.lastError);
            }
            window.close();
          });
        }
      });
    } else {
      chrome.tabs.create(
        { url: targetUrl },
        (tab) => {
          if (chrome.runtime.lastError) {
            console.error('Erro ao abrir a aba:', chrome.runtime.lastError);
            alert('Não foi possível abrir o sistema. Tente novamente.');
          } else {
            window.close();
          }
        }
      );
    }
  });
});

/*
// Evento para o botão "Autenticador"
openSystemButton.addEventListener('click', function() {
  const targetUrl = 'https://infoleg-sileg.camara.leg.br/autenticador/#';
  
  chrome.runtime.sendMessage({ action: 'getMonitoredTabId' }, (response) => {
    const monitoredTabId = response.tabId;

    if (monitoredTabId) {
      // Atualiza a URL da aba monitorada e foca nela
      chrome.tabs.update(monitoredTabId, { url: targetUrl, active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error('Erro ao atualizar a URL ou focar na aba:', chrome.runtime.lastError);
          alert('Não foi possível atualizar a URL ou focar na aba do sistema. Tente novamente.');
        } else {
          chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              console.error('Erro ao focar na janela:', chrome.runtime.lastError);
            }
            window.close();
          });
        }
      });
    } else {
      // Se não houver aba monitorada, cria uma nova aba com a URL desejada
      chrome.tabs.create(
        { url: targetUrl },
        (tab) => {
          if (chrome.runtime.lastError) {
            console.error('Erro ao abrir a aba:', chrome.runtime.lastError);
            alert('Não foi possível abrir o sistema. Tente novamente.');
          } else {
            window.close();
           }
        }
      );
    }
  });
});*/