const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
require('dotenv').config();

let db;
let initialDataLoadPromise = null;

async function initializeDatabase() {
    try {
        db = await open({
            filename: './database.sqlite',
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS current_prices (
                symbol TEXT PRIMARY KEY,
                price REAL NOT NULL,
                last_updated INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mempool_snapshot (
                id INTEGER PRIMARY KEY DEFAULT 1,
                fastest_fee INTEGER,
                half_hour_fee INTEGER,
                hour_fee INTEGER,
                block_height INTEGER,
                tx_count INTEGER,
                calculated_supply REAL,
                last_updated INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS btc_global_metrics_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                market_cap_usd REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS btc_daily_close_prices (
                date TEXT PRIMARY KEY,
                price_usd REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fear_greed_history (
                date TEXT PRIMARY KEY,
                value INTEGER NOT NULL,
                classification TEXT NOT NULL,
                last_updated INTEGER NOT NULL
            );
        `);
        console.log("Banco de dados SQLite conectado e tabelas prontas.");
    } catch (error) {
        console.error("Erro ao inicializar o banco de dados SQLite:", error);
        process.exit(1);
    }
}

async function updateFearGreedData() {
    const timestampLog = new Date().toLocaleString('pt-BR');
    try {
        console.log(`[${timestampLog}] Worker: Buscando dados do Fear & Greed Index...`);
        const response = await axios.get('https://api.alternative.me/fng/?limit=1&format=json');
        const fngData = response.data.data[0];
        const today = new Date().toISOString().split('T')[0];
        const currentTime = Date.now();
        await db.run(
            'INSERT OR REPLACE INTO fear_greed_history (date, value, classification, last_updated) VALUES (?, ?, ?, ?)',
            [today, fngData.value, fngData.value_classification, currentTime]
        );
        console.log(`[${timestampLog}] Worker: Dados do Fear & Greed Index salvos para a data ${today}.`);
    } catch (error) {
        console.error(`[${timestampLog}] Worker: ERRO ao buscar dados do Fear & Greed Index:`, error.message);
    }
}

async function updateHighFrequencyData() {
    const timestampLog = new Date().toLocaleString('pt-BR');
    console.log(`[${timestampLog}] Worker: Buscando dados de alta frequência (Preços, Mempool)...`);
    const coingeckoApiKey = process.env.COINGECKO_API_KEY;
    try {
        const [
            pricesResponse,
            feesResponse,
            blockHeightResponse,
            mempoolStatsResponse
        ] = await Promise.all([
            axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether&vs_currencies=usd,brl&x_cg_demo_api_key=${coingeckoApiKey}`),
            axios.get('https://mempool.space/api/v1/fees/recommended'),
            axios.get('https://mempool.space/api/blocks/tip/height'),
            axios.get('https://mempool.space/api/mempool')
        ]);

        const currentTime = Date.now();
        const pricesData = pricesResponse.data;
        const btcPriceUSD = pricesData?.bitcoin?.usd;
        const btcPriceBRL = pricesData?.bitcoin?.brl;
        const usdtPriceBRL = pricesData?.tether?.brl;

        if (typeof btcPriceUSD !== 'number' || typeof btcPriceBRL !== 'number' || typeof usdtPriceBRL !== 'number') {
            throw new Error(`Resposta de preços da CoinGecko incompleta: ${JSON.stringify(pricesData)}`);
        }

        await db.run('INSERT OR REPLACE INTO current_prices (symbol, price, last_updated) VALUES (?, ?, ?)', ['BTC-USD', btcPriceUSD, currentTime]);
        await db.run('INSERT OR REPLACE INTO current_prices (symbol, price, last_updated) VALUES (?, ?, ?)', ['BTC-BRL', btcPriceBRL, currentTime]);
        await db.run('INSERT OR REPLACE INTO current_prices (symbol, price, last_updated) VALUES (?, ?, ?)', ['USDT-BRL', usdtPriceBRL, currentTime]);

        const blockHeight = blockHeightResponse.data;
        const totalSupply = calculateBitcoinSupply(blockHeight);

        await db.run(
            `INSERT OR REPLACE INTO mempool_snapshot (id, fastest_fee, half_hour_fee, hour_fee, block_height, tx_count, calculated_supply, last_updated) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
            [feesResponse.data.fastestFee, feesResponse.data.halfHourFee, feesResponse.data.hourFee, blockHeight, mempoolStatsResponse.data.count, totalSupply, currentTime]
        );

        const marketCap = btcPriceUSD * totalSupply;
        await db.run('INSERT INTO btc_global_metrics_history (timestamp, market_cap_usd) VALUES (?, ?)', [currentTime, marketCap]);

        console.log(`[${timestampLog}] Worker: Dados de alta frequência salvos com sucesso.`);
    } catch (error) {
        console.error(`[${timestampLog}] Worker: ERRO ao buscar ou validar dados de alta frequência:`, error.message);
    }
}

async function syncHistoricDataOnStartup() {
    const timestampLog = new Date().toLocaleString('pt-BR');
    console.log(`[${timestampLog}] Worker (Inicialização): Sincronizando histórico de preços diários...`);
    const coingeckoApiKey = process.env.COINGECKO_API_KEY;
    try {
        const response = await axios.get(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily&x_cg_demo_api_key=${coingeckoApiKey}`);
        const dailyPrices = response.data.prices;
        if (!dailyPrices || dailyPrices.length === 0) {
            throw new Error("API de histórico não retornou dados.");
        }
        const stmt = await db.prepare('INSERT OR IGNORE INTO btc_daily_close_prices (date, price_usd) VALUES (?, ?)');
        let insertedCount = 0;
        for (const [timestamp, price] of dailyPrices) {
            const date = new Date(timestamp).toISOString().split('T')[0];
            const result = await stmt.run(date, price);
            if (result.changes > 0) insertedCount++;
        }
        await stmt.finalize();
        console.log(`[${timestampLog}] Worker (Inicialização): Sincronização concluída. ${insertedCount} novos registros adicionados.`);
    } catch (error) {
        console.error(`[${timestampLog}] Worker (Inicialização): ERRO ao sincronizar histórico:`, error.message);
    }
}

async function updateLatestDailyData() {
    const timestampLog = new Date().toLocaleString('pt-BR');
    console.log(`[${timestampLog}] Worker (Diário): Buscando último preço de fechamento...`);
    const coingeckoApiKey = process.env.COINGECKO_API_KEY;
    try {
        const response = await axios.get(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=2&interval=daily&x_cg_demo_api_key=${coingeckoApiKey}`);
        if (response.data.prices && response.data.prices.length > 1) {
            const yesterdayData = response.data.prices[response.data.prices.length - 2];
            const date = new Date(yesterdayData[0]).toISOString().split('T')[0];
            const price = yesterdayData[1];
            const result = await db.run('INSERT OR IGNORE INTO btc_daily_close_prices (date, price_usd) VALUES (?, ?)', [date, price]);
            if (result.changes > 0) {
                console.log(`[${timestampLog}] Worker (Diário): Adicionado novo preço de fechamento para a data ${date}.`);
            } else {
                console.log(`[${timestampLog}] Worker (Diário): Preço para ${date} já estava atualizado.`);
            }
        }
    } catch (error) {
        console.error(`[${timestampLog}] Worker (Diário): ERRO ao buscar histórico diário:`, error.message);
    }
}

function calculateBitcoinSupply(blockHeight) {
    let supply = 0;
    let reward = 50;
    let halvingInterval = 210000;
    let blocksRemaining = blockHeight;
    while (blocksRemaining > 0) {
        let blocksInEpoch = Math.min(blocksRemaining, halvingInterval);
        supply += blocksInEpoch * reward;
        reward /= 2;
        blocksRemaining -= blocksInEpoch;
    }
    //Genesys block
    supply += 50;
    return supply;
}


function scheduleHighFrequencyWorker() { cron.schedule('*/10 * * * *', updateHighFrequencyData); }
function scheduleDailyWorker() {
    cron.schedule('15 0 * * *', () => {
        const timestamp = new Date().toLocaleString('pt-BR'); console.log(`[${timestamp}] SCHEDULE: Disparando Worker Diário...`);
        updateFearGreedData();
        updateLatestDailyData();
    });
}


const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.static('public'));

app.get('/api/data', async (req, res) => {
    const timestampLog = new Date().toLocaleString('pt-BR');
    console.log(`[${timestampLog}] API: Recebida requisição. Verificando cache...`);
    
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    try {
        const mempool = await db.get('SELECT * FROM mempool_snapshot WHERE id = 1');
        if (!mempool) {
            console.log(`[${timestampLog}] API: Cache inicial vazio. Aguardando workers...`);
            await initialDataLoadPromise;
            console.log(`[${timestampLog}] API: Workers terminaram. Lendo do SQLite...`);
        } else {
            console.log(`[${timestampLog}] API: Cache pronto. Lendo do SQLite...`);
        }

        const prices = await db.all('SELECT * FROM current_prices');
        const fearGreed = await db.get('SELECT * FROM fear_greed_history ORDER BY date DESC LIMIT 1');
        const globalMetrics = await db.get('SELECT * FROM btc_global_metrics_history ORDER BY timestamp DESC LIMIT 1');
        const dailyPrices = await db.all('SELECT price_usd FROM btc_daily_close_prices ORDER BY date DESC LIMIT 200');
        const freshMempoolData = await db.get('SELECT * FROM mempool_snapshot WHERE id = 1');

        let mayer_multiple = null;
        if (prices?.find(p => p.symbol === 'BTC-USD')?.price && dailyPrices?.length >= 200) {
            const currentPrice = prices.find(p => p.symbol === 'BTC-USD').price;
            const sumOfPrices = dailyPrices.reduce((sum, row) => sum + row.price_usd, 0);
            const sma200 = sumOfPrices / 200;
            mayer_multiple = currentPrice / sma200;
        }

        const responseData = {
            lastUpdateTimestamp: freshMempoolData?.last_updated,
            prices: { btc_usd: prices?.find(p => p.symbol === 'BTC-USD')?.price, btc_brl: prices?.find(p => p.symbol === 'BTC-BRL')?.price, usdt_brl: prices?.find(p => p.symbol === 'USDT-BRL')?.price, },
            mempool: { fastest_fee: freshMempoolData?.fastest_fee, half_hour_fee: freshMempoolData?.half_hour_fee, hour_fee: freshMempoolData?.hour_fee, block_height: freshMempoolData?.block_height, tx_count: freshMempoolData?.tx_count, calculated_supply: freshMempoolData?.calculated_supply, },
            fearGreed: { value: fearGreed?.value, classification: fearGreed?.classification, last_updated: fearGreed?.last_updated },
            globalMetrics: { market_cap_usd: globalMetrics?.market_cap_usd, mayer_multiple: mayer_multiple }
        };

        res.json(responseData);
    } catch (error) {
        console.error("Erro no endpoint /api/data:", error);
        res.status(500).json({ error: "Falha ao processar a requisição." });
    }
});


async function startServer() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
        scheduleHighFrequencyWorker();
        scheduleDailyWorker();
        console.log("Workers agendados. O sistema está operacional.");
        console.log("Disparando workers para popular dados iniciais...");
        initialDataLoadPromise = Promise.all([
            updateFearGreedData(),
            updateHighFrequencyData(),
            syncHistoricDataOnStartup()
        ]);
    });
}

startServer();