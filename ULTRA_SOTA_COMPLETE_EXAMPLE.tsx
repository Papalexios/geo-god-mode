// ULTRA_SOTA_COMPLETE_EXAMPLE.tsx
// Clean, production-grade ULTRA SOTA orchestration layer

import {
  performCompetitorGapAnalysis,
  generateAndValidateReferences,
  generateReferencesHtml,
  enhanceSemanticKeywords,
  extractExistingImages,
  injectImagesIntoContent,
  generateOptimalInternalLinks,
  type CompetitorGap,
  type ValidatedReference,
  type InternalLinkSuggestion,
} from './ultra-sota-services';

import {
  validateContentQuality,
  generateQualityReport,
  validateAndFix,
  type QualityCheckResult,
} from './ultra-sota-quality-validator';

import buildUltraSOTAPrompt, {
  buildGodModePrompt,
  type UltraSOTAArticlePlan,
} from './prompts-ultra-sota';

import type { SitemapPage } from './types';

export interface UltraSOTAResult {
  content: string;
  semanticKeywords: string[];
  gapAnalysis: {
    gaps: CompetitorGap[];
    competitorKeywords: string[];
    missingKeywords: string[];
  };
  references: ValidatedReference[];
  qualityReport: QualityCheckResult;
  metadata: {
    wordCount: number;
    semanticKeywordCount: number;
    gapsCovered: number;
    referencesValidated: number;
    qualityScore: number;
    aiPhrasesFree: boolean;
    internalLinks: InternalLinkSuggestion[];
  };
}

export interface UltraSOTAConfig {
  keyword: string;
  existingPages: SitemapPage[];
  aiClient: any;
  model: string;
  serperApiKey: string;
  serpData: any;
  neuronData?: string | null;
  recentNews?: string | null;
  mode: 'generate' | 'refresh';
  existingContent?: string;
  useGodMode?: boolean;
  onProgress?: (message: string, details?: { step: number; total: number }) => void;
}

/**
 * Internal: choose the correct AI call pattern for the current provider.
 */
async function callModel(
  aiClient: any,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  // Gemini
  if (model.toLowerCase().includes('gemini')) {
    const result = await aiClient.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
      ],
    });
    return result.response.text();
  }

  // OpenAI / OpenRouter / Groq (OpenAI-compatible)
  if (model.toLowerCase().includes('gpt') || aiClient.chat?.completions) {
    const completion = await aiClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.5,
    });

    return completion.choices[0]?.message?.content ?? '';
  }

  // Anthropic / other chat APIs
  const message = await aiClient.messages.create({
    model,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    temperature: 0.5,
  });

  const firstBlock = message.content?.[0];
  if (!firstBlock) return '';
  if (typeof firstBlock === 'string') return firstBlock;
  // Anthropic-style text blocks
  // @ts-ignore
  return firstBlock.text ?? '';
}

/**
 * Core ULTRA SOTA generator (new article).
 */
export async function generateUltraSOTAContent(
  keyword: string,
  existingPages: SitemapPage[],
  aiClient: any,
  model: string,
  serperApiKey: string,
  serpData: any,
  neuronData: string | null = null,
  recentNews: string | null = null,
  onProgress?: (message: string, details?: { step: number; total: number }) => void,
  useGodMode: boolean = false,
  existingContent: string = ''
): Promise<UltraSOTAResult> {
  const totalSteps = 8;

  const progress = (message: string, step: number) =>
    onProgress?.(message, { step, total: totalSteps });

  try {
    // STEP 1 – semantic keywords
    progress('Enhancing semantic keyword graph…', 1);
    const semanticKeywords = await enhanceSemanticKeywords(keyword, neuronData, aiClient, model);

    // STEP 2 – competitor gap analysis
    progress('Analyzing competitors for exploitable gaps…', 2);
    const gapAnalysis = await performCompetitorGapAnalysis(
      keyword,
      serpData,
      aiClient,
      model
    );

    // STEP 3 – article blueprint
    progress('Building comprehensive article blueprint…', 3);
    const allSemanticKeywords = [
      ...semanticKeywords,
      ...gapAnalysis.competitorKeywords,
      ...gapAnalysis.missingKeywords,
    ];

    const articlePlan: UltraSOTAArticlePlan = {
      title: keyword,
      primaryKeyword: keyword,
      semanticKeywords: allSemanticKeywords,
      metaDescription: `Complete ${keyword} guide with up-to-date data, expert insights, and practical actions.`,
      outline: [
        { heading: 'Introduction', wordCount: 250 },
        { heading: 'Key Takeaways', wordCount: 150 },
        { heading: `Understanding ${keyword}`, wordCount: 450 },
        { heading: 'Actionable Strategies', wordCount: 500 },
        { heading: 'Common Mistakes to Avoid', wordCount: 350 },
        { heading: 'Advanced Techniques', wordCount: 450 },
        { heading: 'Real-World Examples', wordCount: 350 },
        { heading: 'Frequently Asked Questions', wordCount: 350 },
        { heading: 'Conclusion', wordCount: 200 },
      ],
      keyTakeaways: [
        `${keyword} requires a structured, data-backed approach to deliver results.`,
        `Recent trends show that ${new Date().getFullYear()} favors specificity and depth over generic advice.`,
        `Execution quality beats tools; most wins come from consistent implementation.`,
        `Common pitfalls around ${keyword} can be avoided with a simple checklist-based workflow.`,
        `Systematic optimization compounds results and improves margins over time.`,
      ],
      faqSection: [
        { question: `What is ${keyword}?`, answer: `A concise, practical definition focused on outcomes.` },
        { question: `How do I get started with ${keyword}?`, answer: `A simple, step-by-step starter plan.` },
        { question: `How long does ${keyword} take to show results?`, answer: `Realistic, evidence-based timelines.` },
        { question: `What tools are essential for ${keyword}?`, answer: `A short, focused tool stack overview.` },
      ],
    };

    // STEP 4 – God Mode vs Standard prompt
    progress(useGodMode ? 'Generating GOD MODE article…' : 'Generating ULTRA SOTA article…', 4);

    const prompt = useGodMode
      ? buildGodModePrompt(
          keyword,
          allSemanticKeywords,
          gapAnalysis.gaps.map((g: CompetitorGap) => g.opportunity),
          existingPages,
          extractExistingImages(existingContent),
          neuronData
        )
      : buildUltraSOTAPrompt(
          articlePlan,
          allSemanticKeywords,
          gapAnalysis.gaps.map((g: CompetitorGap) => g.opportunity),
          existingPages,
          neuronData,
          recentNews
        );

    let rawContent = await callModel(aiClient, model, prompt.system, prompt.user);
    rawContent = rawContent.trim();

    // STEP 5 – auto-fix common issues and banned phrases
    progress('Auto-fixing content quality issues…', 5);
    const { fixed: fixedContent, changes } = validateAndFix(
      rawContent,
      keyword,
      allSemanticKeywords
    );
    const baseContent = fixedContent || rawContent;

    // STEP 6 – dynamic, topic-relevant references
    progress('Generating and validating authoritative references…', 6);
    const contentSummary = baseContent.replace(/<[^>]+>/g, '').slice(0, 1200);
    const references = await generateAndValidateReferences(
      keyword,
      contentSummary,
      serperApiKey,
      aiClient,
      model,
      (msg) => onProgress?.(msg)
    );

    // STEP 7 – internal links + reference injection
    progress('Injecting internal links and references…', 7);
    const internalLinks = generateOptimalInternalLinks(baseContent, existingPages, 15);
    const withLinks = injectInternalLinks(baseContent, internalLinks);
    const referencesHtml = generateReferencesHtml(references);
    const contentWithReferences = `${withLinks}\n\n${referencesHtml}`;

    // STEP 8 – final quality validation
    progress('Running final quality validation…', 8);
    const qualityReport = validateContentQuality(
      contentWithReferences,
      keyword,
      allSemanticKeywords,
      existingPages
    );
    const _reportText = generateQualityReport(qualityReport);

    const plainTextCount = contentWithReferences.replace(/<[^>]+>/g, ' ').trim();
    const wordCount = plainTextCount ? plainTextCount.split(/\s+/).length : 0;

    const aiPhraseCheck = qualityReport.checks.find(
      (c) => c.name === 'AI Detection Phrases'
    );
    const aiPhrasesFree = aiPhraseCheck ? aiPhraseCheck.passed : true;

    const result: UltraSOTAResult = {
      content: contentWithReferences,
      semanticKeywords: allSemanticKeywords,
      gapAnalysis,
      references,
      qualityReport,
      metadata: {
        wordCount,
        semanticKeywordCount: allSemanticKeywords.length,
        gapsCovered: gapAnalysis.gaps.length,
        referencesValidated: references.length,
        qualityScore: qualityReport.score,
        aiPhrasesFree,
        internalLinks,
      },
    };

    return result;
  } catch (error) {
    console.error('ULTRA SOTA Error', error);
    throw error;
  }
}

/**
 * Refresh mode: keep images + structure, fully re-optimize content.
 */
export async function refreshContentUltraSOTA(
  existingContent: string,
  keyword: string,
  existingPages: SitemapPage[],
  aiClient: any,
  model: string,
  serperApiKey: string,
  serpData: any,
  onProgress?: (message: string, details?: { step: number; total: number }) => void
): Promise<{
  content: string;
  preservedImages: number;
  references: ValidatedReference[];
  qualityReport: QualityCheckResult;
}> {
  const totalSteps = 6;
  const progress = (message: string, step: number) =>
    onProgress?.(message, { step, total: totalSteps });

  try {
    // 1) preserve images
    progress('Extracting and preserving existing images…', 1);
    const existingImages = extractExistingImages(existingContent);

    // 2–5) reuse main pipeline with God Mode disabled (to avoid design noise in old posts)
    progress('Refreshing content with ULTRA SOTA pipeline…', 2);
    const refreshed = await generateUltraSOTAContent(
      keyword,
      existingPages,
      aiClient,
      model,
      serperApiKey,
      serpData,
      null,
      null,
      (msg, d) => {
        // remap inner steps into slots 2–5 for UI
        if (!d) return;
        const mappedStep = Math.min(5, 1 + d.step);
        onProgress?.(msg, { step: mappedStep, total: totalSteps });
      },
      false,
      existingContent
    );

    // 5) re-inject original images back into new body
    progress('Reinjecting preserved images into refreshed article…', 5);
    const contentWithImages = injectImagesIntoContent(refreshed.content, existingImages);

    // 6) final validation pass (lightweight)
    progress('Performing final validation on refreshed article…', 6);
    const qualityReport = validateContentQuality(
      contentWithImages,
      keyword,
      refreshed.semanticKeywords,
      existingPages
    );

    return {
      content: contentWithImages,
      preservedImages: existingImages.length,
      references: refreshed.references,
      qualityReport,
    };
  } catch (error) {
    console.error('ULTRA SOTA Refresh Error', error);
    throw error;
  }
}

/**
 * Public entry point used by the rest of the app.
 */
export async function executeUltraSOTA(
  config: UltraSOTAConfig
): Promise<UltraSOTAResult | {
  content: string;
  preservedImages: number;
  references: ValidatedReference[];
  qualityReport: QualityCheckResult;
}> {
  if (config.mode === 'refresh' && config.existingContent) {
    return refreshContentUltraSOTA(
      config.existingContent,
      config.keyword,
      config.existingPages,
      config.aiClient,
      config.model,
      config.serperApiKey,
      config.serpData,
      config.onProgress
    );
  }

  return generateUltraSOTAContent(
    config.keyword,
    config.existingPages,
    config.aiClient,
    config.model,
    config.serperApiKey,
    config.serpData,
    config.neuronData ?? null,
    config.recentNews ?? null,
    config.onProgress,
    config.useGodMode ?? false,
    config.existingContent ?? ''
  );
}

export default executeUltraSOTA;

/**
 * Utility: inject already-computed internal links into HTML content.
 */
function injectInternalLinks(
  content: string,
  links: InternalLinkSuggestion[]
): string {
  if (!links.length) return content;

  let updated = content;
  for (const link of links) {
    const safeAnchor = link.anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeAnchor})`, 'i');
    updated = updated.replace(
      regex,
      `<a href="${link.targetSlug}">$1</a>`
    );
  }
  return updated;
}
