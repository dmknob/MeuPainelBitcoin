document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const amountInput = document.getElementById('dca-amount');
    const frequencySelect = document.getElementById('dca-frequency');
    const dayOfWeekSelect = document.getElementById('dca-day-of-week');
    const dayOfMonthInput = document.getElementById('dca-day-of-month');
    const weeklySelector = document.getElementById('dca-day-selector-weekly');
    const monthlySelector = document.getElementById('dca-day-selector-monthly');
    const simulateBtn = document.getElementById('dca-simulate-btn');
    const resultsDiv = document.getElementById('dca-results');
    const findBestDayBtn = document.getElementById('find-best-dca-day-btn');
    const bestDayResultsDiv = document.getElementById('best-dca-day-results');
    
    let historicalPrices = [];

    // --- LÓGICA DO INDEXEDDB ---
    const DB_NAME = 'BitPanelDB';
    const DB_VERSION = 1; // Se precisar limpar o cache, pode incrementar esta versão
    const STORE_NAME = 'btc_historical_prices';
    let db;

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject("Erro ao abrir o IndexedDB.");
            request.onsuccess = () => { db = request.result; resolve(db); };
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'date' });
                }
            };
        });
    }

    function getPricesFromDb() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onerror = () => reject("Erro ao ler preços do DB.");
            request.onsuccess = () => resolve(request.result);
        });
    }

    function savePricesToDb(prices) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            prices.forEach(price => store.put(price)); // put() faz insert ou update
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject("Erro ao salvar preços no DB.");
        });
    }

    // --- LÓGICA DA APLICAÇÃO ---
    async function initialize() {
        await openDb();
        historicalPrices = await getPricesFromDb();
        
        const today = new Date().toISOString().split('T')[0];
        const lastRecordDate = historicalPrices.length > 0 ? historicalPrices[historicalPrices.length - 1].date : null;

        // Se o DB está vazio ou o último registro não é de hoje, busca na rede
        if (historicalPrices.length === 0 || !lastRecordDate || lastRecordDate < today) {
            console.log("Cache do IndexedDB vazio ou desatualizado. Buscando dados da API...");
            try {
                const response = await fetch('/api/historical-prices');
                const freshPrices = await response.json();
                historicalPrices = freshPrices;
                await savePricesToDb(freshPrices);
                console.log("IndexedDB atualizado com sucesso.");
            } catch (error) {
                console.error("Falha ao buscar dados históricos:", error);
                resultsDiv.innerHTML = `<p>Erro ao carregar dados históricos. Tente novamente.</p>`;
            }
        } else {
            console.log("Usando dados históricos do cache do IndexedDB.");
        }
    }

    // --- LÓGICA DA SIMULAÇÃO ---
    function performDcaSimulation(params) {
        let totalInvested = 0;
        let totalBtc = 0;
        let lastPurchaseDate = null;
        
        const priceColumn = params.currency === 'brl' ? 'price_brl' : 'price_usd';

        for (const record of historicalPrices) {
            const currentDate = new Date(`${record.date}T00:00:00Z`);
            const price = record[priceColumn];
            
            if (!price) continue;
            
            let shouldInvest = false;

            if (params.frequency === 'daily') { shouldInvest = true; } 
            else if (params.frequency === 'weekly' && currentDate.getUTCDay() === params.dayOfWeek) {
                if (!lastPurchaseDate || (currentDate.getTime() - lastPurchaseDate.getTime()) >= 604800000) { // 7 dias em ms
                    shouldInvest = true;
                }
            } else if (params.frequency === 'monthly') {
                const year = currentDate.getUTCFullYear();
                const month = currentDate.getUTCMonth();
                const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
                const targetDay = Math.min(params.dayOfMonth, lastDayOfMonth);
                if (currentDate.getUTCDate() === targetDay) {
                    if (!lastPurchaseDate || lastPurchaseDate.getUTCMonth() !== month || lastPurchaseDate.getUTCFullYear() !== year) {
                        shouldInvest = true;
                    }
                }
            }

            if (shouldInvest) {
                totalInvested += params.amount;
                totalBtc += params.amount / price;
                lastPurchaseDate = currentDate;
            }
        }
        
        const latestPrice = historicalPrices.length > 0 ? historicalPrices[historicalPrices.length - 1][priceColumn] : 0;
        const currentValue = totalBtc * latestPrice;
        const gainLoss = currentValue - totalInvested;
        const gainLossPercent = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

        return { totalInvested, totalBtc, currentValue, gainLoss, gainLossPercent, currency: params.currency };
    }
    
    function renderResults(results) {
        const currencySymbol = results.currency === 'brl' ? 'R$' : '$';
        const locale = results.currency === 'brl' ? 'pt-BR' : 'en-US';
        const gainLossClass = results.gainLoss >= 0 ? 'profit' : 'loss';

        resultsDiv.innerHTML = `
            <p>Total Investido: <span>${currencySymbol} ${results.totalInvested.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></p>
            <p>Total de BTC Acumulado: <span>${results.totalBtc.toFixed(8)} BTC</span></p>
            <p>Valor Atual do Portfólio: <span>${currencySymbol} ${results.currentValue.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></p>
            <p>Lucro / Prejuízo: <span class="${gainLossClass}">${currencySymbol} ${results.gainLoss.toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${results.gainLossPercent.toFixed(2)}%)</span></p>
        `;
    }
    
    function findBestDcaDay() {
        // CORREÇÃO AQUI: Lê a moeda selecionada
        const selectedCurrency = document.querySelector('input[name="dca-currency"]:checked').value;
        const amount = parseFloat(amountInput.value) || 100;
        bestDayResultsDiv.innerHTML = `<p>Analisando... Isso pode levar um momento.</p>`;
        
        setTimeout(() => {
            const weeklyResults = [];
            for (let day = 0; day < 7; day++) {
                // CORREÇÃO AQUI: Passa a moeda para a simulação
                const result = performDcaSimulation({ amount, frequency: 'weekly', dayOfWeek: day, currency: selectedCurrency });
                weeklyResults.push({ day, ...result });
            }
            weeklyResults.sort((a, b) => b.gainLossPercent - a.gainLossPercent);
            
            const monthlyResults = [];
            for (let day = 1; day <= 31; day++) {
                // CORREÇÃO AQUI: Passa a moeda para a simulação
                const result = performDcaSimulation({ amount, frequency: 'monthly', dayOfMonth: day, currency: selectedCurrency });
                monthlyResults.push({ day, ...result });
            }
            monthlyResults.sort((a, b) => b.gainLossPercent - a.gainLossPercent);

            renderBestDayResults(weeklyResults, monthlyResults, amount, selectedCurrency);
        }, 50);
    }

    function renderBestDayResults(weekly, monthly, amount, currency) {
        const currencySymbol = currency === 'brl' ? 'R$' : '$';
        const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        const bestWeekly = weekly[0];
        const bestMonthly = monthly[0];
        
        bestDayResultsDiv.innerHTML = `
            <h4>Resultados da Análise (Aporte de ${currencySymbol}${amount}):</h4>
            <p>Melhor Dia da Semana: <span>${weekDays[bestWeekly.day]} (${bestWeekly.gainLossPercent.toFixed(2)}%)</span></p>
            <p>Melhor Dia do Mês: <span>Dia ${bestMonthly.day} (${bestMonthly.gainLossPercent.toFixed(2)}%)</span></p>
        `;
    }

    // --- EVENT LISTENERS ---
    frequencySelect.addEventListener('change', () => {
        if (frequencySelect.value === 'weekly') {
            weeklySelector.style.display = 'flex';
            monthlySelector.style.display = 'none';
        } else if (frequencySelect.value === 'monthly') {
            weeklySelector.style.display = 'none';
            monthlySelector.style.display = 'flex';
        } else {
            weeklySelector.style.display = 'none';
            monthlySelector.style.display = 'none';
        }
    });
    
    simulateBtn.addEventListener('click', () => {
        // CORREÇÃO AQUI: Lê a moeda selecionada do formulário
        const selectedCurrency = document.querySelector('input[name="dca-currency"]:checked').value;
        const params = {
            amount: parseFloat(amountInput.value),
            currency: selectedCurrency, // Adiciona a moeda aos parâmetros
            frequency: frequencySelect.value,
            dayOfWeek: parseInt(dayOfWeekSelect.value, 10),
            dayOfMonth: parseInt(dayOfMonthInput.value, 10)
        };
        const results = performDcaSimulation(params);
        renderResults(results);
    });
    
    findBestDayBtn.addEventListener('click', findBestDcaDay);

    initialize();
});