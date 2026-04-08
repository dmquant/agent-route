"""Thread-safe, rate-limited Wind API client wrapper."""

import asyncio
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Protocol, runtime_checkable

import structlog
from aiolimiter import AsyncLimiter
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from configs.settings import get_settings
from libs.schemas.market_data import DailyBar, RealtimeQuote, StockInfo

# Use runtime_checkable to allow for mocking in tests
@runtime_checkable
class WindSDK(Protocol):
    """Protocol for WindPy SDK interface."""

    def start(self, user: str = "", password: str = "") -> "WindRes": ...
    def stop(self) -> None: ...
    def isconnected(self) -> bool: ...
    def wsd(
        self,
        codes: str,
        fields: str,
        begin_time: str,
        end_time: str,
        options: str = "",
    ) -> "WindRes": ...
    def wset(self, name: str, options: str = "") -> "WindRes": ...
    def wsq(self, codes: str, fields: str, options: str = "") -> "WindRes": ...


class WindRes(Protocol):
    """Protocol for WindPy response object."""

    ErrorCode: int
    Codes: List[str]
    Fields: List[str]
    Times: List[datetime]
    Data: List[List]


logger = structlog.get_logger(__name__)
settings = get_settings()


class WindAPIError(Exception):
    """Base exception for Wind API errors."""

    def __init__(self, error_code: int, message: str = ""):
        self.error_code = error_code
        self.message = message
        super().__init__(f"Wind API Error {error_code}: {message}")


class WindClient:
    """Singleton wrapper for WindPy SDK."""

    _instance: Optional["WindClient"] = None
    _lock = asyncio.Lock()

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self._limiter = AsyncLimiter(settings.wind_rate_limit, 1)
        self._w = None
        self._is_starting = False
        self._start_time = datetime.now()
        self._error_count = 0

    async def _get_sdk(self) -> WindSDK:
        """Dynamically import WindPy to avoid hard dependency."""
        if self._w is None:
            try:
                from WindPy import w
                self._w = w
            except ImportError:
                logger.error("windpy_sdk_not_found", message="Please install WindPy SDK")
                raise ImportError("WindPy SDK not found")
        return self._w

    async def start(self):
        """Start the Wind session."""
        async with self._lock:
            if self._is_starting:
                return
            self._is_starting = True
            try:
                w = await self._get_sdk()
                if not w.isconnected():
                    # Support authentication if credentials are provided in settings
                    if settings.wind_username:
                        res = w.start(settings.wind_username, settings.wind_password)
                    else:
                        res = w.start()
                        
                    if res.ErrorCode != 0:
                        raise WindAPIError(res.ErrorCode, "Failed to start Wind session")
                    logger.info("wind_session_started", user=settings.wind_username or "local")
            finally:
                self._is_starting = False

    async def stop(self):
        """Stop the Wind session."""
        async with self._lock:
            if self._w and self._w.isconnected():
                self._w.stop()
                logger.info("wind_session_stopped")

    @retry(
        retry=retry_if_exception_type((WindAPIError, asyncio.TimeoutError)),
        stop=stop_after_attempt(settings.wind_retry_max),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def get_daily_bars(
        self, symbols: List[str], start_date: date, end_date: date
    ) -> List[DailyBar]:
        """Fetch daily K-line data for a list of symbols."""
        await self.start()
        
        async with self._limiter:
            w = await self._get_sdk()
            
            codes = ",".join(symbols)
            # Define fields: open, high, low, close, volume, amt, adjfactor
            fields = "open,high,low,close,volume,amt,adjfactor"
            
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(
                None,
                lambda: w.wsd(
                    codes,
                    fields,
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d"),
                    "PriceAdj=F",
                )
            )

            if res.ErrorCode != 0:
                self._error_count += 1
                raise WindAPIError(res.ErrorCode, f"Query failed for {codes[:50]}...")

            bars = []
            num_codes = len(res.Codes)
            num_times = len(res.Times)
            
            # Helper to handle NaN
            def clean_val(val):
                if val is None or str(val).lower() == "nan":
                    return Decimal("0")
                return Decimal(str(val))

            for i in range(num_codes):
                symbol = res.Codes[i]
                for j in range(num_times):
                    # Data structure in wsd with multiple codes: res.Data[field][index]
                    idx = i * num_times + j
                    
                    bar_date = res.Times[j]
                    if isinstance(bar_date, datetime):
                        bar_date = bar_date.date()
                    
                    close_price = clean_val(res.Data[3][idx])
                    if close_price == 0:
                        continue

                    bars.append(DailyBar(
                        symbol=symbol,
                        date=bar_date,
                        open=clean_val(res.Data[0][idx]),
                        high=clean_val(res.Data[1][idx]),
                        low=clean_val(res.Data[2][idx]),
                        close=close_price,
                        volume=clean_val(res.Data[4][idx]),
                        amount=clean_val(res.Data[5][idx]),
                        adj_factor=clean_val(res.Data[6][idx]),
                    ))
            
            return bars

    @retry(
        retry=retry_if_exception_type((WindAPIError, asyncio.TimeoutError)),
        stop=stop_after_attempt(settings.wind_retry_max),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def get_realtime_quotes(self, symbols: List[str]) -> List[RealtimeQuote]:
        """Fetch real-time snapshots (wsq) for a list of symbols."""
        await self.start()
        
        async with self._limiter:
            w = await self._get_sdk()
            
            codes = ",".join(symbols)
            # Define fields for wsq
            fields = "rt_date,rt_time,rt_open,rt_high,rt_low,rt_last,rt_vol,rt_amt,rt_pre_close"
            
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(
                None,
                lambda: w.wsq(codes, fields)
            )

            if res.ErrorCode != 0:
                self._error_count += 1
                raise WindAPIError(res.ErrorCode, f"Realtime query failed for {codes[:50]}...")

            quotes = []
            num_codes = len(res.Codes)
            
            def clean_val(val):
                if val is None or str(val).lower() == "nan":
                    return Decimal("0")
                return Decimal(str(val))

            for i in range(num_codes):
                symbol = res.Codes[i]
                raw_date = res.Data[0][i]
                raw_time = res.Data[1][i]
                
                if isinstance(raw_date, datetime):
                    quote_date = raw_date.date()
                else:
                    quote_date = date.today()

                if isinstance(raw_time, datetime):
                    quote_time = raw_time.time()
                elif isinstance(raw_time, (int, float)):
                    s = str(int(raw_time)).zfill(6)
                    try:
                        from datetime import time
                        quote_time = time(int(s[:2]), int(s[2:4]), int(s[4:]))
                    except:
                        quote_time = datetime.now().time()
                else:
                    quote_time = datetime.now().time()

                quotes.append(RealtimeQuote(
                    symbol=symbol,
                    date=quote_date,
                    time=quote_time,
                    open=clean_val(res.Data[2][i]),
                    high=clean_val(res.Data[3][i]),
                    low=clean_val(res.Data[4][i]),
                    last=clean_val(res.Data[5][i]),
                    volume=clean_val(res.Data[6][i]),
                    amount=clean_val(res.Data[7][i]),
                    prev_close=clean_val(res.Data[8][i]),
                ))
            
            return quotes

    @retry(
        retry=retry_if_exception_type((WindAPIError, asyncio.TimeoutError)),
        stop=stop_after_attempt(settings.wind_retry_max),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def get_stock_list(self) -> List[StockInfo]:
        """Fetch all A-share stocks current constituents."""
        await self.start()
        
        async with self._limiter:
            w = await self._get_sdk()
            
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(
                None,
                lambda: w.wset("sectorconstituent", "date=" + date.today().strftime("%Y-%m-%d") + ";sectorid=a001010100000000")
            )

            if res.ErrorCode != 0:
                self._error_count += 1
                raise WindAPIError(res.ErrorCode, "Failed to fetch stock list from Wind")

            stocks = []
            num_entries = len(res.Data[0])
            for i in range(num_entries):
                symbol = res.Data[1][i]
                name = res.Data[2][i]
                exchange = "SSE" if symbol.endswith(".SH") else "SZSE" if symbol.endswith(".SZ") or symbol.endswith(".BJ") else "OTHER"
                
                stocks.append(StockInfo(
                    symbol=symbol,
                    name=name,
                    exchange=exchange,
                ))
            
            return stocks

    @retry(
        retry=retry_if_exception_type((WindAPIError, asyncio.TimeoutError)),
        stop=stop_after_attempt(settings.wind_retry_max),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def get_financials(
        self, symbol: str, start_date: date, end_date: date
    ) -> List[dict]:
        """Fetch financial statement data using wsd."""
        await self.start()
        async with self._limiter:
            w = await self._get_sdk()
            # Common fields for income, balance, and cashflow
            fields = "oper_rev,net_profit_is,tot_assets,tot_liab,net_cash_flows_oper_act"
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(
                None,
                lambda: w.wsd(
                    symbol,
                    fields,
                    start_date.strftime("%Y-%m-%d"),
                    end_date.strftime("%Y-%m-%d"),
                    "Period=Q;Days=Alldays",
                )
            )
            if res.ErrorCode != 0:
                raise WindAPIError(res.ErrorCode, f"Financials query failed for {symbol}")
            
            data_list = []
            for i in range(len(res.Times)):
                item = {"symbol": symbol, "date": res.Times[i]}
                for j, field in enumerate(res.Fields):
                    val = res.Data[j][i]
                    item[field.lower()] = Decimal(str(val)) if val is not None and str(val).lower() != "nan" else None
                data_list.append(item)
            return data_list

    @retry(
        retry=retry_if_exception_type((WindAPIError, asyncio.TimeoutError)),
        stop=stop_after_attempt(settings.wind_retry_max),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def get_announcements(
        self, symbol: str, start_date: date, end_date: date
    ) -> List[dict]:
        """Fetch company announcements using wset."""
        await self.start()
        async with self._limiter:
            w = await self._get_sdk()
            options = f"startdate={start_date.strftime('%Y-%m-%d')};enddate={end_date.strftime('%Y-%m-%d')};windcode={symbol}"
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(
                None,
                lambda: w.wset("announcement", options)
            )
            if res.ErrorCode != 0:
                raise WindAPIError(res.ErrorCode, f"Announcements query failed for {symbol}")
            
            announcements = []
            if not res.Data:
                return announcements
                
            num_entries = len(res.Data[0])
            for i in range(num_entries):
                announcements.append({
                    "symbol": symbol,
                    "title": res.Data[2][i],
                    "publish_date": res.Data[1][i],
                    "ann_type": res.Data[3][i],
                    "url": res.Data[4][i] if len(res.Data) > 4 else None,
                    "id": res.Data[0][i],
                })
            return announcements

    @retry(
        retry=retry_if_exception_type((WindAPIError, asyncio.TimeoutError)),
        stop=stop_after_attempt(settings.wind_retry_max),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def get_news(
        self, symbol: Optional[str] = None, start_date: Optional[date] = None, limit: int = 50
    ) -> List[dict]:
        """Fetch market or stock news using w.wnews."""
        await self.start()
        async with self._limiter:
            w = await self._get_sdk()
            
            # Simplified news fetch
            begin_time = start_date.strftime("%Y-%m-%d 00:00:00") if start_date else (date.today() - timedelta(days=1)).strftime("%Y-%m-%d 00:00:00")
            options = f"windcode={symbol};count={limit}" if symbol else f"count={limit}"
            
            loop = asyncio.get_running_loop()
            # Note: w.wnews is a common method for news in Wind
            res = await loop.run_in_executor(
                None,
                lambda: w.wnews("101", begin_time, date.today().strftime("%Y-%m-%d 23:59:59"), options)
            )
            
            if res.ErrorCode != 0:
                # Fallback or silent fail for news as it's often restricted
                logger.warning("news_fetch_failed", error_code=res.ErrorCode)
                return []

            news_list = []
            num_entries = len(res.Data[0]) if res.Data else 0
            for i in range(num_entries):
                news_list.append({
                    "title": res.Data[1][i],
                    "publish_time": res.Data[0][i],
                    "source": res.Data[2][i],
                    "url": res.Data[3][i] if len(res.Data) > 3 else None,
                    "content": res.Data[4][i] if len(res.Data) > 4 else None,
                })
            return news_list

    def get_status(self) -> dict:
        """Get current client health metrics."""
        return {
            "is_connected": self._w.isconnected() if self._w else False,
            "error_count": self._error_count,
            "uptime_seconds": (datetime.now() - self._start_time).total_seconds(),
        }
