"""Unit tests for the East Money scraper."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone
from services.data_connector.eastmoney_scraper import EastMoneyScraper

@pytest.fixture
def mock_kafka():
    with patch("services.data_connector.eastmoney_scraper.get_kafka") as mock:
        manager = MagicMock()
        manager.send = AsyncMock()
        mock.return_value = manager
        yield manager

@pytest.fixture
def scraper(mock_kafka):
    return EastMoneyScraper()

@pytest.mark.asyncio
async def test_fetch_news_page(scraper):
    mock_response = {
        "Data": [
            {"Title": "Test News", "ShowTime": "2026-04-07 10:00:00", "Url": "http://test.com/1"}
        ]
    }
    
    with patch.object(scraper, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response
        news = await scraper.fetch_news_page(1)
        
        assert len(news) == 1
        assert news[0]["Title"] == "Test News"
        mock_request.assert_called_once()

@pytest.mark.asyncio
async def test_fetch_announcements_page(scraper):
    mock_response = {
        "data": {
            "list": [
                {"art_title": "Test Announcement", "ann_date": "2026-04-07", "art_code": "123"}
            ]
        }
    }
    
    with patch.object(scraper, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response
        anns = await scraper.fetch_announcements_page(1)
        
        assert len(anns) == 1
        assert anns[0]["art_title"] == "Test Announcement"

@pytest.mark.asyncio
async def test_fetch_news_detail(scraper):
    mock_response = {
        "Data": {
            "Content": "<div>Full News Content</div>"
        }
    }
    with patch.object(scraper, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response
        content = await scraper.fetch_news_detail("test_code")
        assert content == "Full News Content"

@pytest.mark.asyncio
async def test_fetch_announcement_detail(scraper):
    mock_response = {
        "data": {
            "content": "<div>Full Announcement Content</div>"
        }
    }
    with patch.object(scraper, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = mock_response
        content = await scraper.fetch_announcement_detail("test_code")
        assert content == "Full Announcement Content"

@pytest.mark.asyncio
async def test_save_news(scraper):
    news_items = [
        {
            "title": "Test News Save",
            "showTime": "2026-04-07 12:00:00",
            "url": "http://test.com/save1",
            "summary": "Test summary",
            "category": "news"
        }
    ]
    
    with patch("services.data_connector.eastmoney_scraper.async_session_factory") as mock_session_factory:
        mock_session = AsyncMock()
        mock_session_factory.return_value.__aenter__.return_value = mock_session
        mock_session.execute.return_value.rowcount = 1
        
        count = await scraper.save_news(news_items)
        assert count == 1
        mock_session.commit.assert_called_once()
        # Verify Kafka publish
        scraper.kafka.send.assert_called_once()

@pytest.mark.asyncio
async def test_incremental_sync_news(scraper):
    with patch.object(scraper, "get_last_crawl_time", new_callable=AsyncMock) as mock_last_time:
        mock_last_time.return_value = datetime(2026, 4, 7, 9, 0, 0, tzinfo=timezone.utc)
        
        with patch.object(scraper, "fetch_news_page", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = [
                {"title": "New", "showTime": "2026-04-07 10:00:00", "url": "new"},
                {"title": "Old", "showTime": "2026-04-07 08:00:00", "url": "old"}
            ]
            
            with patch.object(scraper, "save_news", new_callable=AsyncMock) as mock_save:
                mock_save.return_value = 1
                
                with patch.object(scraper, "update_crawler_status", new_callable=AsyncMock) as mock_update:
                    await scraper.run_sync_news(max_pages=1)
                    
                    mock_save.assert_called_once()
                    args = mock_save.call_args[0][0]
                    assert len(args) == 1
                    assert args[0]["title"] == "New"
