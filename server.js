/**
 * MACROSIGNAL: QUANTITATIVE RESEARCH TERMINAL [v3.0.0]
 * THE PPE DEFINITIVE BUILD
 * 
 * A high-density analytical platform synthesizing International Political Economy (IPE),
 * Monetary Philosophy, and Quantitative Data Science.
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// --- 1. CORE CONFIGURATION & SECURITY ---
const { FRED_API_KEY, NEWSAPI_KEY, PORT = 8080 } = process.env;
if (!FRED_API_KEY || !NEWSAPI_KEY) {
    console.error("FATAL: Environment variables FRED_API_KEY or NEWSAPI_KEY are missing.");
    process.exit(1);
}

const app = express();
const cache = new NodeCache({ stdTTL: 3600 });
const AXIOS_CONFIG = { timeout: 12000 };

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '15kb' }));

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: "Terminal rate limit exceeded. Analysis throttled." }
});
app.use('/api/', limiter);

// --- 2. QUANTITATIVE ANALYTICS ENGINE ---
const stats = {
    mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
    stdDev: (arr) => {
        const m = stats.mean(arr);
        return Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (arr.length - 1));
    },
    zScore: (arr) => {
        const m = stats.mean(arr);
        const s = stats.stdDev(arr);
        return arr.map(v => (v - m) / (s || 1));
    },
    pearson: (x, y) => {
        const n = x.length;
        if (n !== y.length || n < 5) return 0;
        const mx = stats.mean(x), my = stats.mean(y);
        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            num += (x[i] - mx) * (y[i] - my);
            denX += Math.pow(x[i] - mx, 2);
            denY += Math.pow(y[i] - my, 2);
        }
        const d = Math.sqrt(denX * denY);
        return d === 0 ? 0 : num / d;
    }
};

// --- 3. DATA ORCHESTRATION SERVICE ---
async function getResearchData() {
    const cacheKey = 'master_dataset';
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    try {
        const [dxy, yields, btc] = await Promise.all([
            axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=DTWEXBGS&api_key=${FRED_API_KEY}&file_type=json&observation_start=${start}`, AXIOS_CONFIG),
            axios.get(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${FRED_API_KEY}&file_type=json&observation_start=${start}`, AXIOS_CONFIG),
            axios.get(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily`, AXIOS_CONFIG)
        ]);

        const btcPoints = btc.data.prices.map(p => ({ t: new Date(p[0]).toISOString().slice(0, 10), v: p[1] }));
        const dxyPoints = dxy.data.observations.map(o => ({ t: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v));
        const yieldPoints = yields.data.observations.map(o => ({ t: o.date, v: parseFloat(o.value) })).filter(o => !isNaN(o.v));

        if (!dxyPoints.length || !btcPoints.length) throw new Error('Incomplete data stream');

        const aligned = [];
        let curDxy = dxyPoints[0].v, curYield = yieldPoints[0].v;

        btcPoints.forEach(b => {
            const dMatch = dxyPoints.find(d => d.t === b.t);
            const yMatch = yieldPoints.find(y => y.t === b.t);
            if (dMatch) curDxy = dMatch.v;
            if (yMatch) curYield = yMatch.v;
            aligned.push({ t: b.t, btc: b.v, dxy: curDxy, yields: curYield });
        });

        cache.set(cacheKey, aligned);
        return aligned;
    } catch (e) { 
        console.error("Research Engine Fault:", e.message);
        return null; 
    }
}

// --- 4. API ENDPOINTS ---

app.get('/health', (req, res) => res.json({ status: 'operational', node: process.version }));

app.get('/api/analysis', async (req, res) => {
    if (cache.has('final_analysis')) return res.json(cache.get('final_analysis'));

    const data = await getResearchData();
    if (!data) return res.status(500).json({ error: "Upstream Synchronization Failure" });

    const window = 30;
    const btcRet = data.slice(1).map((d, i) => (d.btc - data[i].btc) / data[i].btc);
    const dxyRet = data.slice(1).map((d, i) => (d.dxy - data[i].dxy) / data[i].dxy);
    
    const currentCorr = stats.pearson(btcRet.slice(-window), dxyRet.slice(-window));
    
    // Historical Regime Mapping
    const regimeHistory = [];
    for(let i = window; i < btcRet.length; i++) {
        const r = stats.pearson(btcRet.slice(i-window, i), dxyRet.slice(i-window, i));
        regimeHistory.push({ t: data[i].t, r });
    }

    let phil = { name: "Locke", tag: "Social Contract", desc: "Digital assets are trading on internal utility and property rights consensus." };
    if (currentCorr > 0.4) phil = { name: "Hobbes", tag: "The Leviathan", desc: "The state managed currency (USD) has captured asset volatility. Protocol is acting as a state proxy." };
    if (currentCorr < -0.3) phil = { name: "Hayek", tag: "Denationalization", desc: "Assets are actively competing with state currency, serving as a spontaneous private money order." };

    const output = {
        metrics: {
            btcPrice: data[data.length-1].btc,
            dxyValue: data[data.length-1].dxy,
            yieldValue: data[data.length-1].yields,
            correlation: currentCorr.toFixed(3),
            sensitivity: Math.round(Math.abs(currentCorr) * 100),
            regimePersistence: regimeHistory.slice(-10).filter(x => (currentCorr > 0 && x.r > 0) || (currentCorr < 0 && x.r < 0)).length
        },
        philosophy: phil,
        visuals: {
            prices: data.slice(-90),
            regimeMap: regimeHistory.slice(-90)
        }
    };

    cache.set('final_analysis', output, 900);
    res.json(output);
});

app.post('/api/simulate', async (req, res) => {
    const rawVal = parseFloat(req.body.dxyChange);
    if (!Number.isFinite(rawVal)) return res.status(400).json({ error: "Non-finite input" });

    const shock = rawVal / 100;
    const data = await getResearchData();
    if (!data) return res.status(500).json({ error: "Simulator data unavailable" });

    const analogues = [];
    for (let i = 1; i < data.length - 10; i++) {
        const move = (data[i].dxy - data[i-1].dxy) / data[i-1].dxy;
        if (Math.abs(move - shock) < 0.004) {
            const reaction = (data[i+5].btc - data[i].btc) / data[i].btc;
            analogues.push({ date: data[i].t, reaction });
        }
    }

    if (analogues.length === 0) return res.json({ message: "Historical anomaly: No matching DXY analogues." });
    const avg = analogues.reduce((a,b) => a + b.reaction, 0) / analogues.length;
    res.json({ count: analogues.length, expected: (avg * 100).toFixed(2) + "%", dates: analogues.slice(0, 5).map(a => a.date) });
});

app.get('/api/news', async (req, res) => {
    try {
        const [macro, geo] = await Promise.all([
            axios.get(`https://newsapi.org/v2/everything?q=Fed+Rate+OR+Inflation&apiKey=${NEWS_KEY}&pageSize=4`, AXIOS_CONFIG),
            axios.get(`https://newsapi.org/v2/everything?q=Geopolitical+Risk+OR+Tariffs&apiKey=${NEWS_KEY}&pageSize=4`, AXIOS_CONFIG)
        ]);
        res.json({ macro: macro.data.articles, geo: geo.data.articles });
    } catch (e) { res.json({ macro: [], geo: [] }); }
});

// --- 5. FRONTEND RESEARCH TERMINAL ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>MacroSignal // Quantitative PPE Terminal</title>
        <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Inter:wght@300;400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
        <style>
            body { background: #050507; color: #a1a1aa; font-family: 'Inter', sans-serif; }
            .serif { font-family: 'Playfair Display', serif; }
            .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
            .glass { background: #0c0c0e; border: 1px solid #1a1a1d; transition: all 0.4s; }
            .glass:hover { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.1); }
            .top-border { border-top: 2px solid #3b82f6; }
            .text-indigo { color: #818cf8; }
            ::-webkit-scrollbar { width: 4px; }
            ::-webkit-scrollbar-thumb { background: #222; }
        </style>
    </head>
    <body class="p-4 lg:p-10">
        <div id="root"></div>
        <script type="text/babel">
            const { useState, useEffect, useRef } = React;

            const Gauge = ({ label, val, sub }) => (
                <div className="glass p-5 rounded-sm top-border">
                    <div className="mono text-slate-600 uppercase tracking-widest mb-2">{label}</div>
                    <div className="text-3xl font-bold serif italic text-white tracking-tighter">{val}</div>
                    <div className="text-[9px] mono text-blue-500 uppercase mt-2 tracking-tighter">{sub}</div>
                </div>
            );

            function App() {
                const [data, setData] = useState(null);
                const [news, setNews] = useState({macro:[], geo:[]});
                const [sim, setSim] = useState({ val: 1.5, res: null, loading: false });
                const mainChart = useRef(null);

                useEffect(() => {
                    fetch('/api/analysis').then(r => r.json()).then(res => {
                        setData(res);
                        renderChart(res.visuals);
                    });
                    fetch('/api/news').then(r => r.json()).then(setNews);
                    return () => { if(mainChart.current) mainChart.current.destroy(); };
                }, []);

                const renderChart = (v) => {
                    const ctx = document.getElementById('researchChart');
                    if (!ctx) return;
                    if (mainChart.current) mainChart.current.destroy();
                    mainChart.current = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: v.prices.map(p => p.t),
                            datasets: [{
                                label: 'Protocol Return', data: v.prices.map(p => p.btc), borderColor: '#818cf8', yAxisID: 'y', tension: 0.3, pointRadius: 0
                            }, {
                                label: 'Sovereign Return', data: v.prices.map(p => p.dxy), borderColor: '#4b5563', yAxisID: 'y1', borderDash: [5, 5], pointRadius: 0
                            }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { display: false }, y1: { display: false },
                                x: { grid: { color: '#0f0f12' }, ticks: { color: '#3f3f46', font: { size: 9 } } }
                            }
                        }
                    });
                };

                const executeSim = async () => {
                    setSim(s => ({...s, loading: true}));
                    const r = await fetch('/api/simulate', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ dxyChange: sim.val })
                    }).then(res => res.json());
                    setSim(s => ({...s, res: r, loading: false}));
                };

                if (!data) return <div className="h-screen flex items-center justify-center mono italic text-blue-500 animate-pulse">BOOTING RESEARCH TERMINAL...</div>;

                return (
                    <div className="max-w-7xl mx-auto">
                        {/* Masthead */}
                        <header className="mb-12 border-b border-white/5 pb-8 flex flex-col md:flex-row justify-between items-end gap-6">
                            <div>
                                <div className="mono text-[10px] text-blue-500 tracking-[0.6em] uppercase mb-4 font-bold">Westphalian Stress Laboratory // Research v3.0</div>
                                <h1 className="text-7xl lg:text-9xl font-bold serif italic text-white tracking-tighter">MacroSignal</h1>
                            </div>
                            <div className="text-right">
                                <div className="text-4xl font-bold serif italic text-indigo-400">{data.philosophy.name} Regime</div>
                                <div className="text-[10px] mono text-slate-500 mt-2 uppercase tracking-widest">{data.philosophy.tag} // Corr: {data.metrics.correlation}</div>
                            </div>
                        </header>

                        {/* Analysis Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            <Gauge label="Sovereign Index" val={data.metrics.dxyValue} sub="US Dollar Index (DXY)" />
                            <Gauge label="Westphalian Stress" val={data.metrics.sensitivity + "%"} sub="Degree of Macro-Capture" />
                            <Gauge label="Persistence" val={data.metrics.regimePersistence + "/10"} sub="Regime Stability Count" />
                            <Gauge label="Protocol Price" val={"$" + data.metrics.btcPrice.toLocaleString()} sub="Bitcoin Spot USD" />
                        </div>

                        <div className="grid grid-cols-12 gap-6">
                            {/* Research Visualization */}
                            <div className="col-span-12 lg:col-span-8 space-y-6">
                                <div className="glass p-8 rounded-sm h-[450px] relative">
                                    <div className="flex justify-between items-center mb-8">
                                        <h3 className="mono text-[10px] uppercase tracking-widest text-slate-500">Multivariate Correlation Map</h3>
                                        <div className="flex gap-4 mono text-[9px] text-slate-600">
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-indigo-400 rounded-full"></span> BTC_USD</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-slate-600 rounded-full"></span> DXY_INDEX</span>
                                        </div>
                                    </div>
                                    <canvas id="researchChart"></canvas>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="glass p-8 border-l-2 border-indigo-500">
                                        <h4 className="mono text-[10px] uppercase text-slate-500 mb-4 tracking-widest">Theoretical Dialectic</h4>
                                        <p className="text-sm italic leading-relaxed text-slate-200 serif font-medium">{data.philosophy.desc}</p>
                                    </div>
                                    <div className="glass p-8 bg-indigo-950/5">
                                        <h4 className="mono text-[10px] uppercase text-slate-500 mb-4 tracking-widest">Analogue Simulator</h4>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex items-center gap-2">
                                                <label className="mono text-[9px] text-slate-500">DXY_Δ(%):</label>
                                                <input type="number" value={sim.val} onChange={e => setSim({...sim, val: e.target.value})} className="bg-black border border-white/5 p-2 text-xs mono text-indigo-400 w-24 outline-none focus:border-indigo-500" />
                                                <button onClick={executeSim} className="bg-indigo-600 text-white mono text-[10px] px-4 py-2 hover:bg-indigo-500 transition-all font-bold">RUN_SIM</button>
                                            </div>
                                            {sim.res && (
                                                <div className="p-4 bg-black border border-white/5 mono text-[10px] text-indigo-400 leading-loose animate-pulse">
                                                    >> ANALOGUES_MATCHED: {sim.res.count || 0}<br/>
                                                    >> EXP_BTC_REACTION: {sim.res.expected || "N/A"}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="glass p-10">
                                    <h3 className="mono text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-8 underline decoration-indigo-500 underline-offset-8">Research Field Notes</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] leading-loose text-slate-400 font-medium">
                                        <div className="space-y-4">
                                            <strong className="text-white uppercase block tracking-tighter">I. Hobbesian State Capture</strong>
                                            When correlation coefficients exceed 0.4, the protocol enters a state of 'Leviathan Capture.' Here, Bitcoin loses its idiosyncratic 'Digital Gold' property and behaves as a high-fidelity barometer for the Federal Reserve's balance sheet expansion.
                                        </div>
                                        <div className="space-y-4">
                                            <strong className="text-white uppercase block tracking-tighter">II. Hayekian Spontaneity</strong>
                                            Inverse correlation (Negative Pearson) signals 'Hayekian Spontaneity.' In this regime, Bitcoin actively competes with the state-managed currency, absorbing capital flight from traditional currency debasement.
                                        </div>
                                        <div className="space-y-4">
                                            <strong className="text-white uppercase block tracking-tighter">III. Lockean Decoupling</strong>
                                            Low correlation scores indicate a mature Social Contract. The asset is no longer a macro-hedge but is valued for its inherent protocol utility—signaling a decoupled 'Store of Value' state.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Geopolitical Sidepanel */}
                            <div className="col-span-12 lg:col-span-4 space-y-6">
                                <div className="glass p-6">
                                    <h3 className="mono text-[10px] uppercase text-indigo-400 mb-8 flex items-center gap-2">
                                        <span className="w-1 h-1 bg-indigo-500 rounded-full animate-ping"></span>
                                        Geopolitical Intelligence
                                    </h3>
                                    <div className="space-y-8">
                                        {news.geo.map((n, i) => (
                                            <div key={i} className="group cursor-pointer">
                                                <div className="mono text-[9px] text-slate-600 mb-2 uppercase">{n.source.name} // {new Date(n.publishedAt).toLocaleDateString()}</div>
                                                <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold leading-snug block group-hover:text-indigo-400 transition-colors text-slate-300 serif italic underline-offset-4 decoration-slate-800">
                                                    {n.title}
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="glass p-6">
                                    <h3 className="mono text-[10px] uppercase text-slate-500 mb-8">Macro-Economic Wire</h3>
                                    <div className="space-y-8">
                                        {news.macro.map((n, i) => (
                                            <div key={i} className="group cursor-pointer">
                                                <div className="mono text-[9px] text-slate-600 mb-2 uppercase">{n.source.name}</div>
                                                <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold leading-snug block group-hover:text-indigo-400 transition-colors text-slate-400">
                                                    {n.title}
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer className="mt-20 py-10 border-t border-white/5 flex flex-col items-center">
                            <div className="mono text-[10px] uppercase tracking-[0.8em] text-slate-800">
                                Quantitative Sovereignty Research Unit // Hand-Coded Framework
                            </div>
                        </footer>
                    </div>
                );
            }

            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(<App />);
        </script>
    </body>
    </html>
    `);
});

// --- 6. LIFECYCLE ---
process.on('SIGTERM', () => {
    console.log('SIGTERM: Flushing research cache and shutting down.');
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`>> MACROSIGNAL QUANT_TERMINAL ONLINE [PORT ${PORT}]`);
});