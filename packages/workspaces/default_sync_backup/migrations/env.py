"""Alembic migration environment configuration.

Supports multi-schema migrations (market_data, analysis, agents)
and auto-generates migrations from SQLAlchemy models.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

# Import all models so Alembic can detect them
import libs.db.models  # noqa: F401
from configs.settings import get_settings
from libs.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Override URL from settings
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

# Schemas managed by Alembic — must match those used in model __table_args__
MANAGED_SCHEMAS = ("market_data", "analysis", "agents")


def include_name(name: str, type_: str, parent_names: dict) -> bool:
    """Filter objects so Alembic only manages our schemas."""
    if type_ == "schema":
        return name in MANAGED_SCHEMAS
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Generates SQL scripts without connecting to the database.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_name=include_name,
        version_table_schema="public",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Connects to the database and applies migrations directly.
    Creates managed schemas if they don't exist yet.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Ensure managed schemas exist before running migrations
        for schema in MANAGED_SCHEMAS:
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_name=include_name,
            version_table_schema="public",
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
