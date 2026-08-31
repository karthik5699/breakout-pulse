# ⚡ BreakoutPulse — 52-Week High & All-Time High Momentum Screener (NSE Equities)

An institutional-grade momentum screener and charting platform built specifically for Indian Equities (NSE). **BreakoutPulse** identifies high-momentum stocks trading near or breaking out of **52-Week Highs** and **All-Time Highs (ATH)** with institutional **Volume Confirmation**.

Built with a high-performance **FastAPI (Python)** backend, persistent SQLite data engine, clean **Quartr-inspired minimalist UI (React + TailwindCSS)**, and interactive **TradingView Lightweight Charts**.

---

## 🎯 Core Trading Philosophy

In momentum and breakout trading, stocks breaking out of **52-Week Highs** and **All-Time Highs** possess zero overhead supply (no trapped sellers looking to break even), making them the fastest movers in the market.

BreakoutPulse systematically screens over **2,500+ NSE stocks** using three quantitative pillars:

1. **52-Week High & All-Time High Proximity**:
   - **All-Time High (ATH)**: Stocks trading within $\pm 5\%$ of their lifetime peak.
   - **Near 52-Week High**: Stocks within $-10\%$ of their 52-week rolling peak.
   - **Recent Listings**: High-momentum recent IPOs ($< 2$ years trading history) printing new highs with clean accumulation.

2. **Institutional Volume Confirmation ($\ge 1.4\times$)**:
   - Compares the latest daily volume against the **50-day average daily volume**.
   - Filters out low-liquidity drift and highlights setups backed by institutional buying power.

3. **Stage 2 Trend Verification (Optional Toggle)**:
   - Verifies that $\text{Price} > 50\text{ SMA} > 200\text{ SMA}$ with a rising 200-day moving average to ensure trading with the prevailing primary trend.

4. **Continuous Adjusted Historical Data**:
   - Uses corporate-action adjusted prices (`auto_adjust=True`) to eliminate artificial chart distortions from NSE stock splits and bonus issues.

---

## 🌟 Key Platform Features

- **High-Speed Parallel Market Scanning**: Multi-threaded scanning engine (`ThreadPoolExecutor`) refreshes 2,500+ NSE stocks in seconds with incremental 1-month daily candle syncing.
- **Quartr-Inspired Design System**:
  - Pure **Inter Typography** with `tabular-nums` for plumb-line vertical decimal alignment across columns.
  - **Ink Black (`#111827`)** and **Muted Charcoal (`#6B7280`)** palette with a refined **`#8069BF`** brand accent.
  - Text-only semantic colors (no loud highlighter pills).
- **Interactive TradingView Lightweight Charts**:
  - Subscribed to real-time crosshair movement (`chart.subscribeCrosshairMove`) displaying live hovered **OHLC**, **candle return %**, **volume**, **50 DMA**, and **200 DMA** levels.
  - Clear, disambiguated resistance overlays: **All-Time High** (Yellow dashed), **52-Week High** (Purple dotted), **50 DMA** (Sky Blue solid), and **200 DMA** (Amber solid).
  - Consolidated duplicate high badges (e.g. `52W / ATH: 33.81 (+0.00%)`) when 52W High matches ATH.
- **Persistent NSE Stock Universe**:
  - Upload custom NSE CSV lists once; they are saved permanently into local SQLite storage.
- **1-Click Free Cloud Deployment**:
  - Production-ready with `render.yaml`, `build.sh`, and multi-stage `Dockerfile` for free hosting on Render.com or Docker containers.

---

## 🚀 Quick Start (Local Setup)

### 1. Requirements
- **Python 3.10+**
- **Node.js 18+**

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/karthik5699/breakout-pulse.git
cd breakout-pulse

# Install Python backend dependencies
pip install -r backend/requirements.txt

# Install frontend dependencies and build production assets
cd frontend
npm install
npm run build
cd ..
```

### 3. Launching the App
```bash
python run.py
```
Open your browser at **`http://localhost:8000`**.

---

## 📂 Project Structure

```
breakout-pulse/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server & REST API (serves React SPA)
│   │   ├── screener_engine.py   # 52W High, ATH, Stage 2 Trend, & Volume Signal engine
│   │   ├── data_engine.py       # Parallel yfinance scanner, SQLite cache & auto-adjust
│   │   ├── universe_store.py    # Persistent NSE stock universe manager
│   │   └── models.py            # Pydantic data schemas & response models
│   ├── data/
│   │   ├── nse_universe.csv     # Tracked NSE stocks universe
│   │   └── market_data.db       # SQLite cached daily candles & price history
│   └── requirements.txt         # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx       # Brand logomark, search, scan trigger, CSV upload
│   │   │   ├── MarketBanner.jsx # ATH, 52W High, Recent Listings metric cards & date
│   │   │   ├── ScreenerTabs.jsx # Filter toggles (Volume Confirmed, Stage 2 Trend)
│   │   │   ├── StockTable.jsx   # Plumb-line tabular screener with tabular-nums
│   │   │   ├── StockGrid.jsx    # Visual stock cards
│   │   │   ├── ChartModal.jsx   # Lightweight Charts with live crosshair OHLC tracking
│   │   │   └── CsvUploader.jsx  # Persistent universe CSV manager modal
│   │   ├── App.jsx              # Root application component
│   │   ├── index.css            # Inter typography variables & custom scrollbars
│   │   └── main.jsx             # React entry point
│   ├── package.json
│   ├── tailwind.config.js       # Ink Black / Charcoal / #8069BF theme
│   └── vite.config.js
├── build.sh                     # Automated build script for cloud hosting
├── render.yaml                  # Render.com Blueprint deployment spec
├── Dockerfile                   # Multi-stage container build
├── run.py                       # Single-command local launcher
└── README.md                    # Documentation
```

---

## ☁️ Free Cloud Deployment (Render.com)

1. Fork or push this repository to your GitHub account.
2. Sign in to **[render.com](https://render.com)**.
3. Click **New +** $\rightarrow$ **Web Service** and select `karthik5699/breakout-pulse`.
4. Configure:
   - **Environment**: `Python 3`
   - **Build Command**: `./build.sh`
   - **Start Command**: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: `Free`
5. Click **Create Web Service**. Your live screener will be accessible with a free SSL domain in ~2 minutes.

---

## 📜 Disclaimer
*BreakoutPulse is built strictly for quantitative research and educational purposes. It does not constitute financial or investment advice. Always manage risk when trading equities.*
