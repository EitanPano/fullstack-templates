# Both stages use the same python tag: the venv's `python` is a symlink into the base image.
FROM python:3.14-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /uvx /bin/
# The image installs Python packages only: uv never downloads an interpreter, and compiles
# bytecode once, here, so the non-root user needs to write nothing at runtime.
ENV UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
WORKDIR /app
# Dependencies first: this layer is cached until pyproject.toml or uv.lock changes.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.14-slim
RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
# @single-start
# The built SPA from the frontend's `dist` target, served when STATIC_DIR names it.
COPY --from=spa --chown=app:app /dist ./public
ENV STATIC_DIR=/app/public
# @single-end
ENV PATH="/app/.venv/bin:$PATH" APP_ENV=production PORT=8000 PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
CMD ["python", "-m", "app.main"]
