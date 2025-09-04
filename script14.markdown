# Cryptocurrency RAG+DAG Analysis Agent

A modern cryptocurrency analysis system using **Retrieval-Augmented Generation (RAG)** and **Directed Acyclic Graph (DAG)** architecture for comprehensive market analysis.

## Architecture

### RAG Components (Retrieval-Augmented Generation)
- **Document Retriever**: Multi-source web search with Exa API
- **Content Scraper**: Universal content extraction (4 methods: axios+cheerio, playwright+cheerio, axios+readability, playwright+readability)

### DAG Components (Directed Acyclic Graph)
- **Query Processor**: GPT-4o synonym generation and crypto token detection
- **Content Processor**: Content filtering, relevance scoring, and insight extraction
- **Analysis Generator**: Gemini 2.0 Flash final analysis synthesis

### Pipeline Flow