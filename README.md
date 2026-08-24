# 🍌 BananaPatterns — Mark Minervini VCP & Breakout Screener (NSE Equities)

An institutional-grade momentum screener and charting platform built specifically for Indian Equities (NSE). It codifies **Mark Minervini’s SEPA® (Specific Entry Point Analysis)** and **Volatility Contraction Pattern (VCP)** methodology with a clean **BananaPatterns** user interface and interactive **TradingView Lightweight Charts**.

---

## 🌟 Key Features

1. **Minervini SEPA® & Trend Template Engine**:
   - **Relative Strength (RS Rating $\ge 70$)**: 12-month weighted momentum ($0.4 \times 3\text{M} + 0.2 \times 6\text{M} + 0.2 \times 9\text{M} + 0.2 \times 12\text{M}$) benchmarked against Nifty 50 (`^NSEI`), percentile-ranked 1–99 across the universe.
   - **Stage 2 Uptrend**: Price > 50 SMA > 150 SMA > 200 SMA, 200 SMA slope $>0$, price $\ge 25\%$ above 52W low, price within $25\%$ of 52W high.
2. **ATR-based ZigZag Swing Detection**:
   - Isolates true price pivots using an adaptive $2.5 \times \text{ATR}_{14}$ threshold, completely eliminating 2–3 day daily chop and spurious micro-flags.
3. **Flexible 2–6 Contraction VCP Pattern Engine**:
   - Enforces Minervini base duration of **5 to 65 weeks** (25 to 325 trading days).
   - Validates sequential contraction depths ($T_1 > T_2 > \dots > T_n$) and maximum base depth ($\le 45\%$).
   - Detects Volume Dry-Up (VDU) on right-side pullbacks ($\le 0.70\times$ 20-day Volume SMA).
4. **Corporate Action Split/Bonus Continuous Adjusted Data**:
   - Uses continuous adjusted prices (`auto_adjust=True`) to eliminate artificial chart distortions from NSE bonus shares and stock splits.
   - Built-in retry logic, exponential backoff, and SQLite caching.
5. **Interactive TradingView Lightweight Charts**:
   - Candlestick series, 50 SMA (blue), 200 SMA (orange), Volume with 20-day Volume MA.
   - Visual **Pivot Resistance Line**, **Suggested Stop-Loss Line**, and **2R/3R Target Lines**.
6. **Risk-First Position Sizing Calculator**:
   - Calculates exact maximum ₹ risk, position size in shares, capital outlay %, and $2R / 3R$ profit targets.
7. **Persistent NSE CSV Universe Storage**:
   - Save your custom CSV once; the system persists it locally and auto-manages updates.

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.9+
- Node.js 18+ (for building the frontend)

### 2. Installation
```bash
# Clone or navigate to directory
cd /Users/karthiksingh/.gemini/antigravity/scratch/vcp-breakout-screener

# Install Python requirements
pip install -r backend/requirements.txt

# Install frontend requirements and build
cd frontend
npm install
npm run build
cd ..
```

### 3. Launching the Screener
```bash
python run.py
```
Open your browser at **`http://localhost:8000`**.

---

## 📂 Project Structure

```
vcp-breakout-screener/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server & REST endpoints
│   │   ├── vcp_engine.py        # RS calculation, ZigZag ATR swings, VCP contractions
│   │   ├── data_engine.py       # yfinance fetcher (auto_adjust=True), SQLite cache & retries
│   │   ├── universe_store.py    # Persistent CSV parser & manager
│   │   └── models.py            # Pydantic data schemas
│   ├── data/
│   │   ├── nse_universe.csv     # Persistent stock universe
│   │   └── market_data.db       # SQLite cached daily candles
│   ├── tests/
│   │   ├── test_vcp_engine.py   # Positive & false-positive test cases
│   │   ├── test_data_engine.py  # Persistence & retry tests
│   │   └── run_tests.py         # Standalone test runner
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx       # Theme toggle, search, scan button, CSV manager
│   │   │   ├── MarketBanner.jsx # Setup counts & Nifty 50 market trend
│   │   │   ├── ScreenerTabs.jsx # In Breakout Zone, Triggered, Developing VCP, All
│   │   │   ├── StockTable.jsx   # Tabular screener with metric badges
│   │   │   ├── StockGrid.jsx    # Visual pattern cards
│   │   │   ├── ChartModal.jsx   # TradingView Lightweight Charts with VCP overlays
│   │   │   ├── RiskCalculator.jsx # Position sizing & R:R calculator
│   │   │   ├── CsvUploader.jsx  # Persistent CSV uploader modal
│   │   │   └── MethodExplainer.jsx # SEPA & VCP anatomy educational guide
│   │   ├── App.jsx
│   │   └── index.css            # BananaPatterns design variables & styles
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
└── run.py                       # Single-command launcher
```

---

## 🛡️ Algorithmic Verification & Tests

Run the test suite:
```bash
python backend/tests/run_tests.py
```
Tests include:
- RS Percentile Ranking ($0.4 \times 3\text{M} + 0.2 \times 6\text{M} + 0.2 \times 9\text{M} + 0.2 \times 12\text{M}$)
- Minervini Stage 2 Trend Template validation
- 3T & 4T VCP pattern detection
- **False-positive rejection**: 2–3 day micro-flags rejected (<5 weeks rule)
- **False-positive rejection**: Over-extended bases (>45% depth) rejected
- **False-positive rejection**: Expanding volatility waves rejected
- Corporate action continuous adjusted price checks
