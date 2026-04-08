"""Idempotent database seed script.

Seeds the database with initial reference data:
  - All 6 analyst agents with default configuration

Usage:
    python scripts/seed.py          # seed the database
    python scripts/seed.py --check  # dry-run: show what would be inserted

This script is safe to run multiple times — it uses INSERT ... ON CONFLICT
to skip rows that already exist.
"""

import argparse
import sys
from pathlib import Path

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from configs.settings import get_settings
from libs.logging_config import setup_logging

logger = structlog.get_logger(__name__)

# ── Seed data ────────────────────────────────────────────────────

AGENT_SEEDS = [
    {
        "analyst_type": "macro",
        "display_name": "宏观分析师",
        "description": "负责宏观经济指标分析、货币政策解读、全球经济趋势研判，为投资决策提供宏观环境背景。",
        "model_name": "claude-sonnet-4-6",
        "config": {
            "focus_areas": ["GDP", "CPI", "PMI", "interest_rates", "fx_rates"],
            "data_sources": ["wind", "fred", "imf"],
            "update_frequency": "daily",
        },
    },
    {
        "analyst_type": "technical",
        "display_name": "技术分析师",
        "description": "负责K线形态识别、技术指标计算、量价关系分析，提供短中期交易信号和支撑阻力位判断。",
        "model_name": "claude-sonnet-4-6",
        "config": {
            "indicators": ["MACD", "RSI", "KDJ", "BOLL", "MA"],
            "timeframes": ["1d", "1w", "1M"],
            "pattern_recognition": True,
        },
    },
    {
        "analyst_type": "fundamental",
        "display_name": "基本面分析师",
        "description": "负责财务报表深度分析、估值模型构建、行业对比研究，评估公司内在价值和成长潜力。",
        "model_name": "claude-sonnet-4-6",
        "config": {
            "valuation_models": ["DCF", "PE", "PB", "EV_EBITDA"],
            "financial_metrics": ["ROE", "ROIC", "FCF", "debt_ratio"],
            "peer_comparison": True,
        },
    },
    {
        "analyst_type": "sentiment",
        "display_name": "舆情分析师",
        "description": "负责新闻舆情监控、社交媒体情绪分析、市场情绪指标追踪，捕捉市场情绪变化和异动信号。",
        "model_name": "claude-sonnet-4-6",
        "config": {
            "sources": ["news", "social_media", "forums", "analyst_reports"],
            "nlp_tasks": ["sentiment", "ner", "topic_modeling"],
            "alert_threshold": 0.8,
        },
    },
    {
        "analyst_type": "risk",
        "display_name": "风险分析师",
        "description": "负责投资组合风险评估、VaR计算、压力测试、相关性分析，提供风险预警和对冲建议。",
        "model_name": "claude-sonnet-4-6",
        "config": {
            "risk_metrics": ["VaR", "CVaR", "Sharpe", "MaxDrawdown", "Beta"],
            "stress_scenarios": ["market_crash", "rate_hike", "sector_rotation"],
            "confidence_level": 0.95,
        },
    },
    {
        "analyst_type": "quantitative",
        "display_name": "量化分析师",
        "description": "负责因子模型构建、统计套利策略、回测分析、Alpha信号挖掘，提供量化投资建议。",
        "model_name": "claude-sonnet-4-6",
        "config": {
            "factor_categories": ["value", "momentum", "quality", "size", "volatility"],
            "backtest_window": "3Y",
            "rebalance_frequency": "monthly",
        },
    },
]


def seed_agents(session: Session, *, dry_run: bool = False) -> int:
    """Insert or update the 6 analyst agents. Returns count of changes."""
    changed = 0
    for agent_data in AGENT_SEEDS:
        # Check if agent already exists
        result = session.execute(
            text("SELECT id FROM agents.agents WHERE analyst_type = :at"),
            {"at": agent_data["analyst_type"]},
        )
        existing = result.fetchone()

        if existing:
            logger.info("agent_exists", analyst_type=agent_data["analyst_type"], action="skip")
            continue

        if dry_run:
            logger.info("would_insert", analyst_type=agent_data["analyst_type"])
            changed += 1
            continue

        session.execute(
            text("""
                INSERT INTO agents.agents (id, analyst_type, display_name, description, model_name, config, version, is_active, created_at, updated_at)
                VALUES (
                    gen_random_uuid(),
                    :analyst_type,
                    :display_name,
                    :description,
                    :model_name,
                    :config::jsonb,
                    '1.0.0',
                    true,
                    now(),
                    now()
                )
                ON CONFLICT (analyst_type) DO NOTHING
            """),
            {
                "analyst_type": agent_data["analyst_type"],
                "display_name": agent_data["display_name"],
                "description": agent_data["description"],
                "model_name": agent_data["model_name"],
                "config": __import__("json").dumps(agent_data["config"]),
            },
        )
        changed += 1
        logger.info("agent_inserted", analyst_type=agent_data["analyst_type"])

    return changed


def run_seed(*, dry_run: bool = False) -> None:
    """Execute all seed operations."""
    setup_logging()
    settings = get_settings()
    engine = create_engine(settings.database_url_sync, echo=False)

    logger.info("seed_start", database=settings.postgres_db, dry_run=dry_run)

    with Session(engine) as session:
        with session.begin():
            agents_changed = seed_agents(session, dry_run=dry_run)

        logger.info(
            "seed_complete",
            agents_changed=agents_changed,
            dry_run=dry_run,
        )

    engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the AI Stock Research database")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Dry-run mode: show what would be inserted without making changes",
    )
    args = parser.parse_args()
    run_seed(dry_run=args.check)


if __name__ == "__main__":
    main()
