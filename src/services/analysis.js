import { AgentBuilder } from "@iqai/adk";
import { google } from "@ai-sdk/google";
import { createAnalysisPrompt, getAnalysisSystemPrompt } from "../config/prompts.js";

/**
 * Sort content by relevance score
 */
export function sortContentNaturally(contents) {
  return contents
    .filter(content => content.metadata.relevanceScore >= 0.1)
    .sort((a, b) => b.metadata.relevanceScore - a.metadata.relevanceScore);
}

/**
 * Generate final analysis using Gemini
 */
export async function generateFinalAnalysis(
  originalQuery,
  synonyms,
  contents
) {
  const analysisPrompt = createAnalysisPrompt(originalQuery, synonyms, contents);
  
  const geminiAgent = await AgentBuilder
    .create("crypto_analyst")
    .withModel(google("gemini-2.5-flash"))
    .withDescription("Expert cryptocurrency analyst")
    .withInstruction(getAnalysisSystemPrompt())
    .build();

  const result = await geminiAgent.runner.ask(analysisPrompt);
  return typeof result === 'string' ? result : JSON.stringify(result);
}