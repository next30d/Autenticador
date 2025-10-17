// Função para verificar o estado da fila
function checkDocumentState() {
  const tbody = document.querySelector('tbody#listaUsuarios');
  if (!tbody) {
    console.log('Tabela #listaUsuarios não encontrada.');
    return { state: 'empty', count: 0 };
  }

  const rows = tbody.querySelectorAll('tr');
  let documentCount = 0;

  rows.forEach(row => {
    // Verifica se a linha contém células <td> com conteúdo significativo
    const cells = row.querySelectorAll('td');
    if (cells.length > 0 && cells[0].textContent.trim() !== '') {
      documentCount++;
    }
  });

  console.log('Estado da fila verificado:', {
    state: documentCount > 0 ? 'not_empty' : 'empty',
    count: documentCount
  });

  return {
    state: documentCount > 0 ? 'not_empty' : 'empty',
    count: documentCount
  };
}

// Listener para mensagens do background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDocumentState') {
    const state = checkDocumentState();
    sendResponse(state);
  }
});