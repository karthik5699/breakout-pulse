import os
import pytest
import pandas as pd
import sqlite3
from backend.app.data_engine import DataEngine

@pytest.fixture
def temp_engine(tmp_path):
    db_file = os.path.join(tmp_path, "test_market_data.db")
    return DataEngine(db_path=db_file)

def test_database_initialization(temp_engine):
    """Verifies SQLite tables are created properly."""
    with sqlite3.connect(temp_engine.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cursor.fetchall()]
        assert "daily_candles" in tables
        assert "ticker_status" in tables
        assert "scan_cache" in tables

def test_candles_persistence_and_retrieval(temp_engine):
    """Verifies that OHLCV candles are saved and read back with correct types."""
    df_sample = pd.DataFrame({
        "date": ["2025-01-01", "2025-01-02", "2025-01-03"],
        "open": [100.0, 102.0, 105.0],
        "high": [105.0, 106.0, 108.0],
        "low": [99.0, 101.0, 104.0],
        "close": [103.0, 105.0, 107.0],
        "volume": [10000.0, 12000.0, 15000.0]
    })

    temp_engine._save_candles_to_db("TRENT", df_sample)
    cached = temp_engine.get_cached_candles("TRENT")

    assert cached is not None
    assert len(cached) == 3
    assert cached["close"].iloc[-1] == 107.0
    assert cached["volume"].iloc[-1] == 15000.0

def test_ticker_status_tracking(temp_engine):
    """Verifies tracking of ticker availability and silent error logging."""
    temp_engine._record_ticker_status("TESTFAIL", "ERROR", 0, "Silent drop test")
    temp_engine._record_ticker_status("TESTOK", "OK", 250, None)

    summary = temp_engine.get_ticker_health_summary()
    assert summary["ok_count"] == 1
    assert summary["error_count"] == 1
    assert summary["errors"][0]["symbol"] == "TESTFAIL"
