"""
Minimal additive schema migration.

`Base.metadata.create_all()` creates missing *tables* but never alters
existing ones, so a database created before Milestone 3 would be missing
the new classification/severity columns and every query against them
would fail. Rather than make people delete their database (and lose
their inspection history) between milestones, this adds any missing
column on startup.

Deliberately additive-only: it never drops or retypes a column. A real
production system would use Alembic (already in requirements.txt) with
versioned migration scripts; this keeps the local dev flow one-command.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.db.database import Base

logger = logging.getLogger(__name__)

# SQLAlchemy type -> SQL type for the dialects we support.
_SQL_TYPES = {
    "INTEGER": "INTEGER",
    "FLOAT": "FLOAT",
    "BOOLEAN": "BOOLEAN",
    "DATETIME": "DATETIME",
    "JSON": "JSON",
}


def _sql_type_for(column) -> str:
    compiled = str(column.type)
    for key, sql in _SQL_TYPES.items():
        if compiled.upper().startswith(key):
            return sql
    return compiled  # VARCHAR(n), TEXT, etc. pass through unchanged


def _default_clause(column) -> str:
    default = getattr(column, "default", None)
    if default is None or default.is_callable or not hasattr(default, "arg"):
        return ""
    value = default.arg
    if isinstance(value, bool):
        return f" DEFAULT {1 if value else 0}"
    if isinstance(value, (int, float)):
        return f" DEFAULT {value}"
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f" DEFAULT '{escaped}'"
    return ""


def apply_additive_migrations(engine: Engine) -> list[str]:
    """Adds any model column that's missing from an existing table.
    Returns the list of applied `table.column` names."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all() will handle brand-new tables
        existing_columns = {c["name"] for c in inspector.get_columns(table.name)}

        for column in table.columns:
            if column.name in existing_columns:
                continue
            sql_type = _sql_type_for(column)
            ddl = f'ALTER TABLE {table.name} ADD COLUMN {column.name} {sql_type}{_default_clause(column)}'
            try:
                with engine.begin() as conn:
                    conn.execute(text(ddl))
                applied.append(f"{table.name}.{column.name}")
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("Could not add column %s.%s: %s", table.name, column.name, exc)

    if applied:
        logger.info("Applied additive migrations: %s", ", ".join(applied))
    return applied
