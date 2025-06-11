// 1. Importar as bibliotecas necessárias
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

// 2. Inicializar o aplicativo Express
const app = express();
const PORT = process.env.PORT || 3000;

// 3. Configurar Middlewares
app.use(cors());
app.use(express.static('public'));

// 4. Definir o endpoint principal da nossa API
app.get('/api/data', async (req, res) => {
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`[${timestamp}] Recebida requisição para /api/data`);

    const coingeckoApiKey = process.env.COINGECKO_API_KEY;

    try {
        const promises = [
            // SUBSTITUINDO A CHAMADA DA BINANCE PELA DA COINGECKO PARA PREÇOS
            axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether&vs_currencies=usd,brl&x_cg_demo_api_key=${coingeckoApiKey}`),
            axios.get(`https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&x_cg_demo_api_key=${coingeckoApiKey}`),
            axios.get(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=199&interval=daily&x_cg_demo_api_key=${coingeckoApiKey}`),
            axios.get('https://api.alternative.me/fng/?limit=1&format=json'),
            axios.get('https://mempool.space/api/v1/fees/recommended'),
            axios.get('https://mempool.space/api/blocks/tip/height'),
            axios.get('https://mempool.space/api/mempool')
        ];

        const results = await Promise.all(promises);
        
        const [
            coinGeckoPrices, // <<<--- Antigo 'binancePrices'
            coinGeckoGeneralData,
            coinGeckoHistoricalData,
            fearGreedRawData,
            mempoolFeesData,
            mempoolBlockHeightData,
            mempoolStatsData
        ] = results.map(result => result.data ? result.data : result); 

        res.json({
            coinGeckoPrices, // <<<--- Enviando os preços da CoinGecko
            coinGeckoGeneralData,
            coinGeckoHistoricalData,
            fearGreedRawData,
            mempoolFeesData,
            mempoolBlockHeightData,
            mempoolStatsData
        });

    } catch (error) {
        console.error("Erro ao buscar dados das APIs externas:", error.message);
        if (error.response) {
            console.error('Erro Axios Detalhes:', {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers,
                configUrl: error.config.url 
            });
        }
        res.status(500).json({ error: "Falha ao buscar dados das APIs externas." });
    }
});

// 5. Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});