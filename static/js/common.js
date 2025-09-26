// --- LÓGICA DO MODO ESCURO ---
const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (toggleSwitch) toggleSwitch.checked = true;
} else {
    document.body.classList.remove('dark-mode');
    if (toggleSwitch) toggleSwitch.checked = false;
}
function switchTheme(e) {
    if (e.target.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }    
}
if (toggleSwitch) toggleSwitch.addEventListener('change', switchTheme, false);


// --- LÓGICA DA ÚLTIMA ATUALIZAÇÃO (CACHE) ---

// Esta função será chamada pelos scripts específicos de cada página (como o dashboard.js)
// para atualizar o horário com os dados frescos do servidor.
function updateGlobalTimestamp(timestamp) {
    const lastUpdateTimeElement = document.getElementById('last-update-time');
    if (lastUpdateTimeElement && timestamp) {
        const updateTime = new Date(timestamp);
        lastUpdateTimeElement.textContent = updateTime.toLocaleTimeString('pt-BR');
    }
}

// Ao carregar a página, esta parte tenta exibir o último timestamp que está salvo no localStorage
// para uma experiência de carregamento mais rápida.
try {
    const cachedData = JSON.parse(localStorage.getItem('cachedData'));
    if (cachedData && cachedData.lastUpdateTimestamp) {
        updateGlobalTimestamp(cachedData.lastUpdateTimestamp);
    }
} catch(e) {
    // Silencia o erro se o cache não existir ou for inválido
    console.log("Cache de timestamp inicial não encontrado.");
}