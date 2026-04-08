# Use an official Python base image
FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    # UV configuration
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies into a virtual environment
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the application code
COPY . .

# Final sync to install the project itself
RUN uv sync --frozen --no-dev

# Ensure the virtual environment's bin directory is in the PATH
ENV PATH="/app/.venv/bin:$PATH"

# Default command (will be overridden in docker-compose)
CMD ["uvicorn", "services.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
