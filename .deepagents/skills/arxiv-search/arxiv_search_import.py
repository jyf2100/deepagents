#!/usr/bin/env python3
"""arXiv Search - Import module for LLM research."""

import sys
sys.path.insert(0, '/Users/roc/deepagents/.deepagents/skills/arxiv-search')

from arxiv_search import query_arxiv

# Search for recent LLM papers
query = "large language models OR LLM"
results = query_arxiv(query, max_papers=10)
print(results)
