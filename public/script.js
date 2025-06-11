// IDs dos Elementos HTML existentes
const precoBrlElement = document.getElementById('bitcoin-preco-brl');
const precoUsdElement = document.getElementById('bitcoin-preco-usd');
const usdtBrlPriceElement = document.getElementById('usdtbrl-price');
const marketCapUsdElement = document.getElementById('bitcoin-marketcap-usd');
const volumeUsdElement = document.getElementById('bitcoin-volume-usd');
const mayerMultipleElement = document.getElementById('bitcoin-mayer-multiple');
const fearGreedValueElement = document.getElementById('fear-greed-value');
const fearGreedClassificationElement = document.getElementById('fear-greed-classification');
const feeFastestElement = document.getElementById('mempool-fee-fastest');
const feeHalfHourElement = document.getElementById('mempool-fee-halfhour');
const feeHourElement = document.getElementById('mempool-fee-hour');
const blockHeightElement = document.getElementById('mempool-block-height');
const mempoolTxCountElement = document.getElementById('mempool-tx-count');

// IDs para a Calculadora Sats
const satsInputElement = document.getElementById('sats-input');
const satsToBrlElement = document.getElementById('sats-to-brl');
const satsToUsdElement = document.getElementById('sats-to-usd');

// Variáveis globais
let currentBitcoinPriceUSD = 0;
let currentBitcoinPriceBRL = 0;
// A variável currentPygToBrlRate foi REMOVIDA

const SATS_PER_BTC = 100000000;

async function fetchAllData() {
    try {
        const response = await fetch('/api/data'); 
        if (!response.ok) {
            throw new Error(`Erro ao buscar dados do servidor: ${response.statusText}`);
        }
        const data = await response.json();

        // --- 1. Processa Preços da Binance ---
        const btcUsdtData = data.binancePrices.find(p => p.symbol === 'BTCUSDT');
        const btcBrlData = data.binancePrices.find(p => p.symbol === 'BTCBRL');
        const usdtBrlData = data.binancePrices.find(p => p.symbol === 'USDTBRL');
        
        currentBitcoinPriceUSD = btcUsdtData ? parseFloat(btcUsdtData.price) : 0;
        currentBitcoinPriceBRL = btcBrlData ? parseFloat(btcBrlData.price) : 0;
        const precoUsdtBrl = usdtBrlData ? parseFloat(usdtBrlData.price) : 0;
        
        precoBrlElement.textContent = `R$ ${currentBitcoinPriceBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        precoUsdElement.textContent = `$ ${currentBitcoinPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        usdtBrlPriceElement.textContent = `R$ ${precoUsdtBrl.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

        // O bloco para processar a taxa PYG/BRL foi REMOVIDO
        
        // --- 2. Processa Dados Gerais da CoinGecko ---
        marketCapUsdElement.textContent = `$ ${data.coinGeckoGeneralData.market_data.market_cap.usd.toLocaleString('en-US')}`;
        volumeUsdElement.textContent = `$ ${data.coinGeckoGeneralData.market_data.total_volume.usd.toLocaleString('en-US')}`;

        // --- 3. Processa Múltiplo de Mayer ---
        const pricesForSMA = data.coinGeckoHistoricalData.prices.map(item => item[1]);
        if (currentBitcoinPriceUSD > 0 && pricesForSMA.length >= 200) {
            const sumOfPrices = pricesForSMA.slice(-200).reduce((sum, price) => sum + price, 0);
            const sma200 = sumOfPrices / 200;
            mayerMultipleElement.textContent = (currentBitcoinPriceUSD / sma200).toFixed(2);
        } else {
            mayerMultipleElement.textContent = (currentBitcoinPriceUSD === 0) ? 'Aguardando preço...' : 'Dados insuficientes';
        }

        // --- 4. Processa Fear & Greed Index ---
        const fngData = data.fearGreedRawData.data[0];
        fearGreedValueElement.textContent = fngData.value;
        fearGreedClassificationElement.textContent = fngData.value_classification;

        // --- 5, 6, 7. Processa Dados da Rede (Mempool.space) ---
        feeFastestElement.textContent = `${data.mempoolFeesData.fastestFee} sat/vB`;
        feeHalfHourElement.textContent = `${data.mempoolFeesData.halfHourFee} sat/vB`;
        feeHourElement.textContent = `${data.mempoolFeesData.hourFee} sat/vB`;
        blockHeightElement.textContent = data.mempoolBlockHeightData.toLocaleString('pt-BR');
        mempoolTxCountElement.textContent = data.mempoolStatsData.count.toLocaleString('pt-BR');
        
        // Atualiza a calculadora sats caso haja valor no input
        if (satsInputElement && satsInputElement.value) calculateSatsConversion();

    } catch (error) {
        console.error('Falha ao buscar ou processar dados do backend:', error);
    }
}

// Função da Calculadora Sats
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

// Inicia as atualizações e configura as calculadoras
document.addEventListener('DOMContentLoaded', () => {
    fetchAllData(); 
    setInterval(fetchAllData, 600000); 

    if (satsInputElement) {
        satsInputElement.addEventListener('input', calculateSatsConversion);
        calculateSatsConversion(); 
    }
});