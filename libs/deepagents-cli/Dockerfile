# DeepAgents Web UI Docker Image
# Build from worktree root: docker build -f libs/deepagents-cli/Dockerfile -t deepagents-web .
FROM python:3.11-slim

# 镜像源配置（通过 build-arg 覆盖）
ARG PIP_INDEX_URL=https://pypi.org/simple
ARG NPM_REGISTRY_URL=https://registry.npmjs.org

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    NPM_REGISTRY_URL=${NPM_REGISTRY_URL} \
    UV_INDEX_URL=${PIP_INDEX_URL}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy deepagents library first (from worktree root)
COPY libs/deepagents /tmp/deepagents
RUN cd /tmp/deepagents && uv pip install --system -e . && cd / && rm -rf /tmp/deepagents

# Copy deepagents-cli package files
COPY libs/deepagents-cli/pyproject.toml ./

# Modify pyproject.toml to remove local path reference
RUN sed -i 's|deepagents = { path = "../deepagents" }||' pyproject.toml

# Install dependencies using uv (without lock file to avoid local refs)
RUN uv pip install --system deepagents==0.2.8 && \
    uv pip install --system \
    requests \
    rich \
    prompt-toolkit \
    langchain-openai \
    tavily-python \
    python-dotenv \
    daytona \
    modal \
    markdownify \
    langchain \
    runloop-api-client \
    pillow \
    pyyaml \
    fastapi \
    uvicorn[standard]

# Copy application code
COPY libs/deepagents-cli/deepagents_cli/ ./deepagents_cli/

# Expose port
EXPOSE 7777

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:7777/health || exit 1

# Run the application
CMD ["uvicorn", "deepagents_cli.server.web:app", "--host", "0.0.0.0", "--port", "7777"]
