// IDs dos Elementos HTML
const precoBrlElement = document.getElementById('bitcoin-preco-brl');
const precoUsdElement = document.getElementById('bitcoin-preco-usd');
const usdtBrlPriceElement = document.getElementById('usdtbrl-price');
const marketCapUsdElement = document.getElementById('bitcoin-marketcap-usd');
const mayerMultipleElement = document.getElementById('bitcoin-mayer-multiple');
const fearGreedValueElement = document.getElementById('fear-greed-value');
const fearGreedClassificationElement = document.getElementById('fear-greed-classification');
const fearGreedLastUpdatedElement = document.getElementById('fear-greed-last-updated');
const feeFastestElement = document.getElementById('mempool-fee-fastest');
const feeHalfHourElement = document.getElementById('mempool-fee-halfhour');
const feeHourElement = document.getElementById('mempool-fee-hour');
const blockHeightElement = document.getElementById('mempool-block-height');
const totalBtcSupplyElement = document.getElementById('total-btc-supply');
const mempoolTxCountElement = document.getElementById('mempool-tx-count');
const satsInputElement = document.getElementById('sats-input');
const satsToBrlElement = document.getElementById('sats-to-brl');
const satsToUsdElement = document.getElementById('sats-to-usd');
const lastUpdateTimeElement = document.getElementById('last-update-time');

// Variáveis globais
let currentBitcoinPriceUSD = 0;
let currentBitcoinPriceBRL = 0;
const SATS_PER_BTC = 100000000;
let updateScheduler = null;

// Configurações do Agendador
const JITTER_MS = 10000; // Variação aleatória de até 10 segundos


// --- FUNÇÃO DE RENDERIZAÇÃO ---
function renderData(data) {

    // CHAMA A FUNÇÃO GLOBAL para atualizar o timestamp principal
    if (typeof updateGlobalTimestamp === 'function') {
        updateGlobalTimestamp(data.lastUpdateTimestamp);
    }
    
    if (!data) return;

    if (data.lastUpdateTimestamp) {
        const updateTime = new Date(data.lastUpdateTimestamp);
        lastUpdateTimeElement.textContent = updateTime.toLocaleTimeString('pt-BR');
    } else {
        lastUpdateTimeElement.textContent = "Aguardando...";
    }

    currentBitcoinPriceUSD = data.prices?.btc_usd || 0;
    currentBitcoinPriceBRL = data.prices?.btc_brl || 0;
    const precoUsdtBrl = data.prices?.usdt_brl || 0;
    
    precoBrlElement.textContent = `R$ ${currentBitcoinPriceBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    precoUsdElement.textContent = `$ ${currentBitcoinPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    usdtBrlPriceElement.textContent = `R$ ${precoUsdtBrl.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
    
    marketCapUsdElement.textContent = `$ ${data.globalMetrics?.market_cap_usd?.toLocaleString('en-US', {maximumFractionDigits: 0}) || 'N/D'}`;
    mayerMultipleElement.textContent = data.globalMetrics?.mayer_multiple?.toFixed(2) || 'N/D';

    fearGreedValueElement.textContent = data.fearGreed?.value || 'N/D';
    fearGreedClassificationElement.textContent = data.fearGreed?.classification || 'N/D';
    if (data.fearGreed?.last_updated) {
        fearGreedLastUpdatedElement.textContent = new Date(data.fearGreed.last_updated).toLocaleString('pt-BR');
    } else {
        fearGreedLastUpdatedElement.textContent = 'N/D';
    }

    feeFastestElement.textContent = `${data.mempool?.fastest_fee || 'N/D'} sat/vB`;
    feeHalfHourElement.textContent = `${data.mempool?.half_hour_fee || 'N/D'} sat/vB`;
    feeHourElement.textContent = `${data.mempool?.hour_fee || 'N/D'} sat/vB`;
    blockHeightElement.textContent = data.mempool?.block_height?.toLocaleString('pt-BR') || 'N/D';
    totalBtcSupplyElement.textContent = data.mempool?.calculated_supply?.toLocaleString('pt-BR', {maximumFractionDigits: 0}) || 'N/D';
    mempoolTxCountElement.textContent = data.mempool?.tx_count?.toLocaleString('pt-BR') || 'N/D';
    
    if (satsInputElement && satsInputElement.value) calculateSatsConversion();
}

// --- LÓGICA DE ATUALIZAÇÃO INTELIGENTE ---
async function fetchAllData() {
    console.log("Buscando dados atualizados do servidor...");
    try {
        const response = await fetch(`/api/data?t=${Date.now()}`); 
        if (!response.ok) {
            throw new Error(`Servidor não está pronto ou respondeu com erro: ${response.status}`);
        }
        const freshData = await response.json();
        if (typeof freshData.timeUntilNextUpdate !== 'number') {
            throw new Error("Resposta do servidor não continha a instrução de tempo 'timeUntilNextUpdate'.");
        }
        localStorage.setItem('cachedData', JSON.stringify(freshData));
        renderData(freshData);
        console.log("Dados renderizados com sucesso.");
        scheduleNextUpdate(freshData.timeUntilNextUpdate);
    } catch (error) {
        console.error('Falha na requisição de dados:', error.message);
        console.log("Tentando novamente em 30 segundos...");
        if (updateScheduler) clearTimeout(updateScheduler);
        updateScheduler = setTimeout(fetchAllData, 30000);
    }
}

function scheduleNextUpdate(timeFromServerMs) {
    if (updateScheduler) clearTimeout(updateScheduler);
    if (typeof timeFromServerMs !== 'number') {
        console.error("Instrução de tempo do servidor inválida. Tentando novamente em 60s.");
        updateScheduler = setTimeout(fetchAllData, 60000);
        return;
    }
    const randomJitter = Math.random() * JITTER_MS;
    let finalDelay = timeFromServerMs + randomJitter;
    if (finalDelay < 5000) {
        finalDelay = 5000;
    }
    console.log(`Próxima atualização agendada para daqui a ${Math.round(finalDelay / 1000)} segundos (instrução do servidor).`);
    updateScheduler = setTimeout(fetchAllData, finalDelay);
}

// --- FUNÇÃO DA CALCULADORA SATS ---
function calculateSatsConversion() {
    if (!satsInputElement || !satsToBrlElement || !satsToUsdElement) return;
    const satsAmount = parseFloat(satsInputElement.value);
    if (isNaN(satsAmount) || satsAmount <= 0 || currentBitcoinPriceBRL === 0 || currentBitcoinPriceUSD === 0) {
        satsToBrlElement.textContent = 'R$ 0.00';
        satsToUsdElement.textContent = '$ 0.00';
        return;
    }
    const btcAmount = satsAmount / SATS_PER_BTC;
    const valueInBRL = btcAmount * currentBitcoinPriceBRL;
    const valueInUSD = btcAmount * currentBitcoinPriceUSD;
    satsToBrlElement.textContent = `R$ ${valueInBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
    satsToUsdElement.textContent = `$ ${valueInUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
}

// --- INICIALIZAÇÃO DA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        const cachedData = JSON.parse(localStorage.getItem('cachedData'));
        if (cachedData) {
            console.log("Renderizando dados do cache do localStorage...");
            renderData(cachedData);
        }
    } catch (e) {
        console.error("Não foi possível ler os dados do cache:", e);
    }
    fetchAllData(); 
    if (satsInputElement) {
        satsInputElement.addEventListener('input', calculateSatsConversion);
        calculateSatsConversion(); 
    }
});