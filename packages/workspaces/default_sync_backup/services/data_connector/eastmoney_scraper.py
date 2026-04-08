"""East Money (eastmoney.com) web scraper for market intelligence.

This service collects news, announcements, research reports, and fund flows
using East Money's mobile and desktop APIs. It supports incremental crawling
and anti-scraping measures.
"""

from __future__ import annotations

import asyncio
import json
import random
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Union

import httpx
import structlog
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from configs.settings import get_settings
from libs.db.intelligence_models import Announcement, CrawlerStatus, News, MarketFundFlow
from libs.db.session import async_session_factory
from libs.mq.kafka_client import get_kafka, TOPIC_NEWS_FINANCIAL, TOPIC_MARKET_DATA

logger = structlog.get_logger(__name__)
settings = get_settings()


class EastMoneyScraper:
    """Scraper for East Money market intelligence data."""

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            verify=False,
        )
        self.semaphore = asyncio.Semaphore(5)
        self.last_request_time = 0
        self.cookies = {}
        self.proxy: Optional[str] = None
        self.kafka = get_kafka()

    async def _get_headers(self) -> Dict[str, str]:
        """Return randomized headers for anti-scraping."""
        ua = random.choice(settings.eastmoney_user_agents)
        referer = "https://www.eastmoney.com/"
        if "iPhone" in ua or "Android" in ua:
            referer = "https://mguba.eastmoney.com/"
            
        return {
            "User-Agent": ua,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": referer,
            "Origin": "https://mguba.eastmoney.com" if "mguba" in referer else "https://www.eastmoney.com",
            "Connection": "keep-alive",
            "Cache-Control": "max-age=0",
        }

    async def _refresh_proxy(self):
        """Fetch a new proxy from the proxy pool if configured."""
        if settings.eastmoney_proxy_pool_url:
            try:
                response = await self.client.get(settings.eastmoney_proxy_pool_url)
                if response.status_code == 200:
                    self.proxy = response.text.strip()
                    logger.info("refreshed_proxy", proxy=self.proxy)
            except Exception as e:
                logger.warning("proxy_refresh_failed", error=str(e))

    async def _request(self, method: str, url: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Execute a rate-limited HTTP request with anti-scraping measures."""
        async with self.semaphore:
            # Rate limiting
            elapsed = time.time() - self.last_request_time
            delay = 1.0 / settings.eastmoney_rate_limit
            if elapsed < delay:
                await asyncio.sleep(delay - elapsed + random.uniform(0.1, 0.5))

            headers = await self._get_headers()
            if "headers" in kwargs:
                headers.update(kwargs.pop("headers"))

            # Proxy usage
            if self.proxy:
                kwargs["proxies"] = {"http://": self.proxy, "https://": self.proxy}

            try:
                response = await self.client.request(
                    method, url, headers=headers, cookies=self.cookies, **kwargs
                )
                
                # Update cookies
                if response.cookies:
                    self.cookies.update(response.cookies)
                
                if response.status_code == 403 or response.status_code == 429:
                    logger.warning("request_blocked", status=response.status_code, url=url)
                    await self._refresh_proxy()
                    return None

                response.raise_for_status()
                self.last_request_time = time.time()
                
                text = response.text
                if not text:
                    logger.warning("empty_response", url=url)
                    return None

                # Handle JSONP responses
                if text.startswith("datatable") or "jQuery" in text:
                    match = re.search(r"\(({.*})\)", text)
                    if match:
                        return json.loads(match.group(1))
                
                try:
                    return response.json()
                except Exception as je:
                    logger.error("json_parse_failed", url=url, text=text[:200], error=str(je))
                    return None
            except Exception as e:
                logger.error("request_failed", url=url, error=str(e))
                return None

    # ── Data Fetching Methods ───────────────────────────────────────

    async def fetch_news_page(self, page_index: int = 1, page_size: int = 20) -> List[Dict[str, Any]]:
        """Fetch general news from the mobile web API."""
        url = "https://np-listapi.eastmoney.com/comm/web/getNewsList"
        params = {
            "id": "AS201", # AS201: A-share news
            "pageIndex": page_index,
            "pageSize": page_size,
        }
        data = await self._request("GET", url, params=params)
        if data and data.get("Data"):
            return data["Data"]
        return []

    async def fetch_news_detail(self, art_code: str) -> Optional[str]:
        """Fetch full content for a news item."""
        url = "https://newsapi.eastmoney.com/api/news/getnewsdetail"
        params = {
            "artCode": art_code,
            "product": "Eastmoney",
            "plat": "iPhone",
            "version": "10.0.0",
        }
        data = await self._request("GET", url, params=params)
        if data and data.get("Data") and data["Data"].get("Content"):
            soup = BeautifulSoup(data["Data"]["Content"], "lxml")
            return soup.get_text(separator="\n", strip=True)
        return None

    async def fetch_announcement_detail(self, art_code: str) -> Optional[str]:
        """Fetch full content for an announcement."""
        url = "https://np-anotice-stock.eastmoney.com/api/security/ann/getanncontent"
        params = {"art_code": art_code, "client_source": "standard"}
        data = await self._request("GET", url, params=params)
        if data and data.get("data") and data["data"].get("content"):
            soup = BeautifulSoup(data["data"]["content"], "lxml")
            return soup.get_text(separator="\n", strip=True)
        return None

    async def fetch_announcements_page(self, page_index: int = 1, page_size: int = 20) -> List[Dict[str, Any]]:
        """Fetch company announcements."""
        url = "https://np-anotice-stock.eastmoney.com/api/security/ann/getannlist"
        params = {
            "pageSize": page_size,
            "pageIndex": page_index,
            "ann_type": "A",
            "client_source": "standard",
        }
        data = await self._request("GET", url, params=params)
        if data and data.get("data") and data["data"].get("list"):
            return data["data"]["list"]
        return []

    async def fetch_research_reports(self, page_index: int = 1, page_size: int = 50) -> List[Dict[str, Any]]:
        """Fetch research report summaries."""
        url = "https://reportapi.eastmoney.com/report/list"
        params = {
            "industryCode": "*",
            "pageSize": page_size,
            "pageNo": page_index,
            "industry": "*",
            "rating": "*",
            "ratingChange": "*",
            "qType": "0",
            "code": "*",
        }
        data = await self._request("GET", url, params=params)
        if data and data.get("data"):
            return data["data"]
        return []

    async def fetch_fund_flows(self, page_index: int = 1, page_size: int = 50) -> List[Dict[str, Any]]:
        """Fetch market fund flows."""
        url = "https://push2.eastmoney.com/api/qt/clist/get"
        params = {
            "pn": page_index,
            "pz": page_size,
            "po": "1",
            "np": "1",
            "fltt": "2",
            "invt": "2",
            "fid": "f62",
            "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
            "fields": "f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124",
        }
        data = await self._request("GET", url, params=params)
        if data and data.get("data") and data["data"].get("diff"):
            return data["data"]["diff"]
        return []

    # ── Database Saving & Kafka Publishing Methods ─────────────────

    async def save_news(self, news_items: List[Dict[str, Any]], category: str = "news") -> int:
        """Save news items to the database and publish to Kafka."""
        new_count = 0
        async with async_session_factory() as session:
            for item in news_items:
                try:
                    # Support both old and new API field names
                    title = item.get("Title") or item.get("title") or item.get("art_title") or "No Title"
                    time_str = item.get("ShowTime") or item.get("showTime") or item.get("publish_time") or item.get("publishDate")
                    summary = item.get("Description") or item.get("summary") or item.get("art_summary")
                    url = item.get("Url") or item.get("url")
                    art_code = item.get("NewsId") or item.get("artCode") or item.get("art_code")
                    
                    if not time_str: continue
                    
                    try:
                        publish_time = datetime.strptime(time_str[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    except ValueError:
                        try:
                            publish_time = datetime.strptime(time_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        except ValueError:
                            if isinstance(time_str, (int, float)):
                                publish_time = datetime.fromtimestamp(time_str, tz=timezone.utc)
                            else:
                                continue

                    stocks = item.get("stocks") or item.get("Stocks") or []
                    if item.get("stockCode") or item.get("StockCode"):
                        stocks.append({
                            "stockCode": item.get("stockCode") or item.get("StockCode"), 
                            "stockName": item.get("stockName") or item.get("StockName")
                        })
                    
                    symbols = [s.get("stockCode") or s.get("StockCode") for s in stocks if (s.get("stockCode") or s.get("StockCode"))]

                    # Fetch detail if content is missing
                    content = item.get("content") or item.get("Content")
                    if not content and art_code:
                        content = await self.fetch_news_detail(art_code)

                    news_data = {
                        "title": title,
                        "summary": summary,
                        "content": content,
                        "publish_time": publish_time,
                        "source": item.get("Source") or "eastmoney",
                        "url": url or f"https://mguba.eastmoney.com/msginfo/{art_code}.html",
                        "category": category,
                        "related_stocks": {"symbols": symbols},
                        "metadata_json": self._sanitize_dict(item)
                    }

                    stmt = insert(News).values(**news_data).on_conflict_do_nothing(index_elements=["url"])
                    
                    result = await session.execute(stmt)
                    if result.rowcount > 0:
                        new_count += 1
                        # Publish to Kafka
                        try:
                            await self.kafka.send(TOPIC_NEWS_FINANCIAL, news_data, key=category)
                        except Exception as ke:
                            logger.warning("kafka_publish_failed", error=str(ke))
                            
                except Exception as e:
                    logger.warning("news_parse_failed", error=str(e), item_title=item.get("title"))
            
            await session.commit()
        return new_count

    async def save_announcements(self, ann_items: List[Dict[str, Any]]) -> int:
        """Save announcements to the database and publish to Kafka."""
        new_count = 0
        async with async_session_factory() as session:
            for item in ann_items:
                try:
                    dt_str = item["ann_date"]
                    if len(dt_str) > 10:
                        p_time = datetime.strptime(dt_str[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    else:
                        p_time = datetime.strptime(dt_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    
                    url = f"https://data.eastmoney.com/notices/detail/{item.get('codes', [{}])[0].get('stockCode', '0')}/{item['art_code']}.html"
                    
                    stock_symbol = ""
                    if item.get("codes"):
                        stock_symbol = item["codes"][0].get("stockCode", "")

                    # Fetch detail if content is missing
                    content = item.get("content")
                    art_code = item.get("art_code")
                    if not content and art_code:
                        content = await self.fetch_announcement_detail(art_code)

                    ann_data = {
                        "title": item["art_title"],
                        "content": content,
                        "publish_time": p_time,
                        "stock_symbol": stock_symbol,
                        "url": url,
                        "ann_type": item.get("ann_type"),
                        "metadata_json": self._sanitize_dict(item)
                    }

                    stmt = insert(Announcement).values(**ann_data).on_conflict_do_nothing(index_elements=["url"])
                    
                    result = await session.execute(stmt)
                    if result.rowcount > 0:
                        new_count += 1
                        # Publish to Kafka
                        try:
                            await self.kafka.send(TOPIC_MARKET_DATA, ann_data, key=stock_symbol)
                        except Exception as ke:
                            logger.warning("kafka_publish_failed", error=str(ke))
                            
                except Exception as e:
                    logger.warning("announcement_parse_failed", error=str(e), item_title=item.get("art_title"))
            
            await session.commit()
        return new_count

    async def save_fund_flows(self, flow_items: List[Dict[str, Any]]) -> int:
        """Save fund flow items to the database and publish to Kafka."""
        new_count = 0
        async with async_session_factory() as session:
            for item in flow_items:
                try:
                    trade_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                    if item.get("f124") and item["f124"] != "-":
                        trade_date = datetime.fromtimestamp(int(item["f124"]), tz=timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                    
                    flow_data = {
                        "symbol": item["f12"],
                        "name": item["f14"],
                        "trade_date": trade_date,
                        "main_net_inflow": self._to_float(item.get("f62")),
                        "main_net_inflow_pct": self._to_float(item.get("f184")),
                        "super_large_inflow": self._to_float(item.get("f66")),
                        "large_inflow": self._to_float(item.get("f69")),
                        "medium_inflow": self._to_float(item.get("f72")),
                        "small_inflow": self._to_float(item.get("f75")),
                        "metadata_json": self._sanitize_dict(item)
                    }

                    stmt = insert(MarketFundFlow).values(**flow_data).on_conflict_do_update(
                        index_elements=["symbol", "trade_date"],
                        set_={
                            "main_net_inflow": flow_data["main_net_inflow"],
                            "main_net_inflow_pct": flow_data["main_net_inflow_pct"],
                            "updated_at": datetime.now(timezone.utc)
                        }
                    )
                    
                    result = await session.execute(stmt)
                    if result.rowcount > 0:
                        new_count += 1
                        # Publish to Kafka
                        try:
                            await self.kafka.send(TOPIC_MARKET_DATA, flow_data, key=flow_data["symbol"])
                        except Exception as ke:
                            logger.warning("kafka_publish_failed", error=str(ke))
                            
                except Exception as e:
                    logger.warning("fund_flow_parse_failed", error=str(e), symbol=item.get("f12"))
            
            await session.commit()
        return new_count

    # ── Orchestration Methods ──────────────────────────────────────

    async def run_sync_news(self, max_pages: int = 15):
        """Synchronize news incrementally."""
        logger.info("sync_news_start", source="eastmoney")
        last_crawl_time = await self.get_last_crawl_time("news")
        total_new = 0
        latest_publish_time = last_crawl_time

        for page in range(1, max_pages + 1):
            items = await self.fetch_news_page(page)
            if not items: break
            
            new_items = []
            for item in items:
                try:
                    time_str = item.get("ShowTime") or item.get("showTime")
                    if not time_str: continue
                    p_time = datetime.strptime(time_str[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    if last_crawl_time and p_time <= last_crawl_time - timedelta(minutes=5):
                        continue
                    new_items.append(item)
                    if not latest_publish_time or p_time > latest_publish_time:
                        latest_publish_time = p_time
                except Exception: continue
            
            if not new_items and last_crawl_time: break
            count = await self.save_news(new_items, category="news")
            total_new += count
            if count == 0 and page > 1: break
            
        if latest_publish_time and (not last_crawl_time or latest_publish_time > last_crawl_time):
            await self.update_crawler_status("news", latest_publish_time, total_new)
        logger.info("sync_news_completed", total_new=total_new)

    async def run_sync_announcements(self, max_pages: int = 15):
        """Synchronize announcements incrementally."""
        logger.info("sync_announcements_start", source="eastmoney")
        last_crawl_time = await self.get_last_crawl_time("announcements")
        total_new = 0
        latest_publish_time = last_crawl_time

        for page in range(1, max_pages + 1):
            items = await self.fetch_announcements_page(page)
            if not items: break
            
            new_items = []
            for item in items:
                try:
                    dt_str = item["ann_date"]
                    if len(dt_str) > 10:
                        p_time = datetime.strptime(dt_str[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    else:
                        p_time = datetime.strptime(dt_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        
                    if last_crawl_time and p_time < last_crawl_time: continue
                    new_items.append(item)
                    if not latest_publish_time or p_time > latest_publish_time:
                        latest_publish_time = p_time
                except Exception: continue

            if not new_items and last_crawl_time: break
            count = await self.save_announcements(new_items)
            total_new += count
            if count == 0 and page > 1: break

        if latest_publish_time and (not last_crawl_time or latest_publish_time > last_crawl_time):
            await self.update_crawler_status("announcements", latest_publish_time, total_new)
        logger.info("sync_announcements_completed", total_new=total_new)

    async def run_sync_reports(self, max_pages: int = 10):
        """Synchronize research reports incrementally."""
        logger.info("sync_reports_start", source="eastmoney")
        last_crawl_time = await self.get_last_crawl_time("reports")
        total_new = 0
        latest_publish_time = last_crawl_time

        for page in range(1, max_pages + 1):
            items = await self.fetch_research_reports(page)
            if not items: break
            
            new_items = []
            for item in items:
                try:
                    p_time = datetime.strptime(item["publishDate"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    if last_crawl_time and p_time <= last_crawl_time: continue
                    
                    report_item = {
                        "title": f"[{item.get('insName')}] {item.get('title')}",
                        "summary": item.get("summary"),
                        "publish_time": item["publishDate"],
                        "url": f"https://data.eastmoney.com/report/zw_stock.jshtml?encodeUrl={item.get('encodeUrl')}",
                        "category": "report",
                        "stockCode": item.get("stockCode"),
                        "stockName": item.get("stockName"),
                        "content": item.get("summary"),
                        "metadata": item
                    }
                    new_items.append(report_item)
                    if not latest_publish_time or p_time > latest_publish_time:
                        latest_publish_time = p_time
                except Exception: continue

            if not new_items and last_crawl_time: break
            count = await self.save_news(new_items, category="report")
            total_new += count
            if count == 0 and page > 1: break
            
        if latest_publish_time and (not last_crawl_time or latest_publish_time > last_crawl_time):
            await self.update_crawler_status("reports", latest_publish_time, total_new)
        logger.info("sync_reports_completed", total_new=total_new)

    async def run_sync_fund_flows(self, max_pages: int = 5):
        """Synchronize market fund flows."""
        logger.info("sync_fund_flows_start", source="eastmoney")
        total_new = 0
        for page in range(1, max_pages + 1):
            items = await self.fetch_fund_flows(page)
            if not items: break
            count = await self.save_fund_flows(items)
            total_new += count
        logger.info("sync_fund_flows_completed", total_new=total_new)

    # ── Utilities ──────────────────────────────────────────────────

    async def get_last_crawl_time(self, category: str) -> Optional[datetime]:
        """Fetch the last successful crawl time for a category."""
        async with async_session_factory() as session:
            stmt = select(CrawlerStatus.last_crawl_time).where(
                CrawlerStatus.source == "eastmoney",
                CrawlerStatus.category == category
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def update_crawler_status(self, category: str, last_time: datetime, count: int):
        """Update the crawl status in the database."""
        async with async_session_factory() as session:
            stmt = insert(CrawlerStatus).values(
                source="eastmoney",
                category=category,
                last_crawl_time=last_time,
                last_success_at=datetime.now(timezone.utc),
                total_records=count
            ).on_conflict_do_update(
                index_elements=["source", "category"],
                set_={
                    "last_crawl_time": last_time,
                    "last_success_at": datetime.now(timezone.utc),
                    "total_records": CrawlerStatus.total_records + count
                }
            )
            await session.execute(stmt)
            await session.commit()

    def _to_float(self, val: Any) -> Optional[float]:
        if val is None or val == "-": return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def _sanitize_dict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert objects to JSON-serializable types."""
        sanitized = {}
        for k, v in data.items():
            if isinstance(v, (datetime, timedelta)):
                sanitized[k] = str(v)
            elif isinstance(v, dict):
                sanitized[k] = self._sanitize_dict(v)
            elif isinstance(v, list):
                sanitized[k] = [str(x) if isinstance(x, (datetime, timedelta)) else x for x in v]
            else:
                sanitized[k] = v
        return sanitized

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
