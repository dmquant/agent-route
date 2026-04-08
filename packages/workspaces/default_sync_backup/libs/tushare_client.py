"""Low-level Tushare Pro API client.

Handles authentication, rate limiting, and raw data fetching from Tushare Pro HTTP API.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

import httpx
from aiolimiter import AsyncLimiter
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from configs.settings import get_settings

logger = logging.getLogger(__name__)

class TushareAPIError(Exception):
    """Exception raised for Tushare API errors."""
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(f"Tushare API Error {code}: {message}")

class TushareClient:
    """Async client for Tushare Pro HTTP API."""

    def __init__(self, token: Optional[str] = None):
        settings = get_settings()
        self.token = token or settings.tushare_token
        self.base_url = "https://api.tushare.pro"
        
        # Rate limit: Tushare Pro limits are usually per minute.
        # Default to 200 requests per minute if not configured.
        rate_limit = settings.tushare_rate_limit or 200
        self.limiter = AsyncLimiter(rate_limit, 60)
        
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((httpx.RequestError, asyncio.TimeoutError)),
        reraise=True,
    )
    async def request(
        self, 
        api_name: str, 
        params: Optional[Dict[str, Any]] = None, 
        fields: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Perform a request to Tushare Pro API with rate limiting and retries."""
        
        if not self.token:
            raise ValueError("Tushare token is not configured.")

        payload = {
            "api_name": api_name,
            "token": self.token,
            "params": params or {},
            "fields": fields or "",
        }

        async with self.limiter:
            try:
                response = await self.client.post(self.base_url, json=payload)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error occurred: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                raise

        if data.get("code") != 0:
            # Code -1 might mean rate limit exceeded on Tushare's side despite our local limiter
            code = data.get("code")
            msg = data.get("msg")
            if code == -1 or "每分钟最多访问" in msg:
                logger.warning(f"Tushare rate limit hit: {msg}. Retrying...")
                # We could potentially wait here or let tenacity handle it if we raise a specific error
                raise TushareAPIError(code, msg)
            raise TushareAPIError(code, msg)

        # Tushare returns data in {fields: [], items: [[]]} format
        result_data = data.get("data")
        if not result_data:
            return []

        fields_list = result_data.get("fields", [])
        items = result_data.get("items", [])
        
        # Convert to list of dicts
        return [dict(zip(fields_list, item)) for item in items]

    async def query_all(
        self, 
        api_name: str, 
        params: Optional[Dict[str, Any]] = None, 
        fields: Optional[str] = None,
        limit: int = 5000
    ) -> List[Dict[str, Any]]:
        """Query all data, handling pagination if necessary (Tushare Pro uses limit/offset for some APIs)."""
        # Note: Tushare Pro pagination varies by API. Many don't support traditional offset.
        # For now, we assume simple query. If more than 'limit' items are needed, 
        # the caller should handle time-range splitting.
        return await self.request(api_name, params, fields)
