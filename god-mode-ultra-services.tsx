import { GOD_MODE_ULTRA_PROMPTS, GodModeUltraEngine, SERPGapKeyword, DynamicReference, EEATSignals, TopicalCluster, AIVisibilitySignals } from './god-mode-ultra';
import { ApiClients, GenerationContext, SiteInfo, ExpandedGeoTargeting, GeneratedContent } from './types';
import { generateFullSchema } from './schema-generator';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const TARGET_YEAR = now.getMonth() === 11 ? CURRENT_YEAR + 1 : CURRENT_YEAR;

interface GodModeUltraResult {
    serpGaps: SERPGapKeyword[];
    topicalCluster: TopicalCluster | null;
    eeatSignals: EEATSignals | null;
    aiVisibility: AIVisibilitySignals | null;
    dynamicReferences: Map<string, DynamicReference[]>;
    paaQuestions: string[];
    competitorAnalysis: any;
}

export const callGodModeUltraAI = async (
    apiClients: ApiClients,
    selectedModel: string,
    geoTargeting: ExpandedGeoTargeting,
    openrouterModels: string[],
    selectedGroqModel: string,
    promptConfig: { systemInstruction: string; userPrompt: string },
    responseFormat: 'json' | 'html' | 'text' = 'json'
): Promise<string> => {
    if (!apiClients) throw new Error('API clients not initialized');

    const client = apiClients[selectedModel as keyof ApiClients];
    if (!client) {
        const fallbackOrder: (keyof ApiClients)[] = ['gemini', 'openai', 'anthropic', 'openrouter', 'groq'];
        for (const fallback of fallbackOrder) {
            if (apiClients[fallback]) {
                return callGodModeUltraAI(
                    apiClients,
                    fallback,
                    geoTargeting,
                    openrouterModels,
                    selectedGroqModel,
                    promptConfig,
                    responseFormat
                );
            }
        }
        throw new Error('No API clients available');
    }

    let responseText = '';

    try {
        switch (selectedModel) {
            case 'gemini': {
                const { GoogleGenAI } = await import('@google/genai');
                const gemini = client as InstanceType<typeof GoogleGenAI>;
                const config: any = { systemInstruction: promptConfig.systemInstruction };
                if (responseFormat === 'json') config.responseMimeType = 'application/json';

                const response = await gemini.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: promptConfig.userPrompt,
                    config
                });
                responseText = response.text || '';
                break;
            }
            case 'openai':
            case 'openrouter':
            case 'groq': {
                const OpenAI = (await import('openai')).default;
                const openaiClient = client as InstanceType<typeof OpenAI>;
                const model = selectedModel === 'groq' ? selectedGroqModel :
                              selectedModel === 'openrouter' ? openrouterModels[0] :
                              'gpt-4-turbo-preview';

                const response = await openaiClient.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: promptConfig.systemInstruction },
                        { role: 'user', content: promptConfig.userPrompt }
                    ],
                    ...(responseFormat === 'json' && { response_format: { type: 'json_object' } })
                });
                responseText = response.choices[0]?.message?.content || '';
                break;
            }
            case 'anthropic': {
                const Anthropic = (await import('@anthropic-ai/sdk')).default;
                const anthropic = client as InstanceType<typeof Anthropic>;
                const response = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 8192,
                    system: promptConfig.systemInstruction,
                    messages: [{ role: 'user', content: promptConfig.userPrompt }]
                });
                responseText = response.content?.map((c: any) => c.text).join('') || '';
                break;
            }
        }
    } catch (error) {
        console.error('[GodModeUltra] AI call error:', error);
        throw error;
    }

    return responseText;
};

export const performGodModeUltraAnalysis = async (
    keyword: string,
    context: GenerationContext,
    dispatch: React.Dispatch<any>
): Promise<GodModeUltraResult> => {
    const { apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel, serperApiKey, wpConfig } = context;

    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Initiating comprehensive SERP analysis for: ${keyword}` });

    const result: GodModeUltraResult = {
        serpGaps: [],
        topicalCluster: null,
        eeatSignals: null,
        aiVisibility: null,
        dynamicReferences: new Map(),
        paaQuestions: [],
        competitorAnalysis: null
    };

    try {
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Fetching top 3 competitor content...` });
        const competitorData = await GodModeUltraEngine.fetchCompetitorContent(keyword, serperApiKey);
        result.paaQuestions = competitorData.paaQuestions;

        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Analyzing SERP gaps - finding top 10 uncovered keywords...` });
        const gapPrompt = GOD_MODE_ULTRA_PROMPTS.serp_gap_analyzer;
        const gapResponse = await callGodModeUltraAI(
            apiClients,
            selectedModel,
            geoTargeting,
            openrouterModels,
            selectedGroqModel,
            {
                systemInstruction: gapPrompt.systemInstruction,
                userPrompt: gapPrompt.userPrompt(
                    keyword,
                    competitorData.competitor1,
                    competitorData.competitor2,
                    competitorData.competitor3
                )
            },
            'json'
        );

        try {
            const gapData = JSON.parse(gapResponse);
            result.serpGaps = gapData.uncoveredKeywords || [];
            result.competitorAnalysis = gapData.competitorAnalysis || null;
            dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Identified ${result.serpGaps.length} competitor gaps to exploit` });
        } catch (e) {
            console.error('[GodModeUltra] Gap analysis parse error:', e);
        }

        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Building topical authority cluster...` });
        const topicalPrompt = GOD_MODE_ULTRA_PROMPTS.topical_authority_builder;
        const topicalResponse = await callGodModeUltraAI(
            apiClients,
            selectedModel,
            geoTargeting,
            openrouterModels,
            selectedGroqModel,
            {
                systemInstruction: topicalPrompt.systemInstruction,
                userPrompt: topicalPrompt.userPrompt(keyword, null)
            },
            'json'
        );

        try {
            result.topicalCluster = JSON.parse(topicalResponse);
            const totalKeywords = (result.topicalCluster?.semanticVariations?.length || 0) +
                                  (result.topicalCluster?.longtailPhrases?.length || 0);
            dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Generated ${totalKeywords} semantic keywords for topical authority` });
        } catch (e) {
            console.error('[GodModeUltra] Topical cluster parse error:', e);
        }

        const contentOutline = result.serpGaps.slice(0, 5).map(g => g.suggestedHeading || g.keyword);
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Generating maximum E-E-A-T signals...` });
        const eeatPrompt = GOD_MODE_ULTRA_PROMPTS.eeat_signal_maximizer;
        const eeatResponse = await callGodModeUltraAI(
            apiClients,
            selectedModel,
            geoTargeting,
            openrouterModels,
            selectedGroqModel,
            {
                systemInstruction: eeatPrompt.systemInstruction,
                userPrompt: eeatPrompt.userPrompt(keyword, contentOutline.join('\n'))
            },
            'json'
        );

        try {
            result.eeatSignals = JSON.parse(eeatResponse);
            const signalCount = (result.eeatSignals?.dataPoints?.length || 0) +
                               (result.eeatSignals?.expertQuotes?.length || 0) +
                               (result.eeatSignals?.citableSnippets?.length || 0);
            dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Generated ${signalCount} E-E-A-T credibility signals` });
        } catch (e) {
            console.error('[GodModeUltra] E-E-A-T parse error:', e);
        }

        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Optimizing for AI visibility (ChatGPT, Perplexity, Google AI)...` });
        const aiPrompt = GOD_MODE_ULTRA_PROMPTS.ai_visibility_optimizer;
        const aiResponse = await callGodModeUltraAI(
            apiClients,
            selectedModel,
            geoTargeting,
            openrouterModels,
            selectedGroqModel,
            {
                systemInstruction: aiPrompt.systemInstruction,
                userPrompt: aiPrompt.userPrompt(keyword, contentOutline)
            },
            'json'
        );

        try {
            result.aiVisibility = JSON.parse(aiResponse);
            dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] AI visibility optimization complete` });
        } catch (e) {
            console.error('[GodModeUltra] AI visibility parse error:', e);
        }

        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Fetching unique authoritative references per section...` });
        const sectionTopics = result.serpGaps.slice(0, 6).map(g => g.keyword);
        result.dynamicReferences = await GodModeUltraEngine.fetchDynamicReferences(
            keyword,
            sectionTopics,
            serperApiKey,
            wpConfig.url
        );

        let refCount = 0;
        result.dynamicReferences.forEach(refs => refCount += refs.length);
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Curated ${refCount} unique authoritative references` });

    } catch (error) {
        console.error('[GodModeUltra] Analysis error:', error);
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Analysis error: ${error}` });
    }

    return result;
};

export const generateGodModeUltraContent = async (
    keyword: string,
    context: GenerationContext,
    ultraAnalysis: GodModeUltraResult,
    dispatch: React.Dispatch<any>
): Promise<string> => {
    const { apiClients, selectedModel, geoTargeting, openrouterModels, selectedGroqModel } = context;

    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Generating enterprise-grade content...` });

    const semanticKeywords: string[] = [
        ...(ultraAnalysis.topicalCluster?.semanticVariations || []),
        ...(ultraAnalysis.topicalCluster?.longtailPhrases || []).slice(0, 10),
        ...ultraAnalysis.serpGaps.slice(0, 5).map(g => g.keyword)
    ];

    const competitorGaps = ultraAnalysis.serpGaps.map(gap =>
        `${gap.keyword} - ${gap.reason} [Suggested: ${gap.suggestedHeading}]`
    );

    const snippetType = ultraAnalysis.serpGaps[0]?.searchIntent === 'Informational' ? 'PARAGRAPH' :
                        ultraAnalysis.serpGaps[0]?.searchIntent === 'Transactional' ? 'LIST' : 'TABLE';

    const articlePlan = {
        primaryKeyword: keyword,
        seoTitle: `${keyword} - The Complete ${TARGET_YEAR} Guide`,
        metaDescription: `Discover everything about ${keyword}. Expert insights, data-backed strategies, and actionable tips for ${TARGET_YEAR}.`
    };

    const writerPrompt = GOD_MODE_ULTRA_PROMPTS.ultimate_article_writer;
    const contentResponse = await callGodModeUltraAI(
        apiClients,
        selectedModel,
        geoTargeting,
        openrouterModels,
        selectedGroqModel,
        {
            systemInstruction: writerPrompt.systemInstruction,
            userPrompt: writerPrompt.userPrompt(
                articlePlan,
                competitorGaps,
                semanticKeywords,
                ultraAnalysis.eeatSignals,
                ultraAnalysis.paaQuestions,
                null,
                null,
                snippetType as 'LIST' | 'TABLE' | 'PARAGRAPH'
            )
        },
        'html'
    );

    let finalContent = contentResponse
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    const referencesHtml = GodModeUltraEngine.generateReferencesHtml(
        ultraAnalysis.dynamicReferences,
        keyword
    );

    if (referencesHtml && !finalContent.includes('sota-references-section')) {
        const conclusionMatch = finalContent.match(/<h2[^>]*>.*?(Final Thoughts|Conclusion).*?<\/h2>/i);
        if (conclusionMatch) {
            const insertPoint = finalContent.lastIndexOf('</p>');
            if (insertPoint > -1) {
                finalContent = finalContent.slice(0, insertPoint + 4) + '\n\n' + referencesHtml + finalContent.slice(insertPoint + 4);
            }
        } else {
            finalContent += '\n\n' + referencesHtml;
        }
    }

    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Content generation complete - ${finalContent.length} characters` });

    return finalContent;
};

export const executeGodModeUltraPipeline = async (
    keyword: string,
    context: GenerationContext,
    dispatch: React.Dispatch<any>,
    existingPages: any[]
): Promise<GeneratedContent | null> => {
    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] ═══════════════════════════════════════` });
    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] INITIATING ENTERPRISE-GRADE CONTENT PIPELINE` });
    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Target: ${keyword}` });
    dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] ═══════════════════════════════════════` });

    try {
        const ultraAnalysis = await performGodModeUltraAnalysis(keyword, context, dispatch);

        const htmlContent = await generateGodModeUltraContent(keyword, context, ultraAnalysis, dispatch);

        const allSemanticKeywords = [
            ...(ultraAnalysis.topicalCluster?.semanticVariations || []),
            ...(ultraAnalysis.topicalCluster?.longtailPhrases || []).slice(0, 15),
            ...ultraAnalysis.serpGaps.slice(0, 10).map(g => g.keyword)
        ];

        const slug = keyword
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        const generatedContent: GeneratedContent = {
            title: `${keyword} - The Complete ${TARGET_YEAR} Guide`,
            slug,
            metaDescription: `Discover everything about ${keyword}. Expert insights, ${TARGET_YEAR} data, and actionable strategies. Comprehensive guide covering ${ultraAnalysis.serpGaps.length}+ topics competitors miss.`,
            primaryKeyword: keyword,
            semanticKeywords: allSemanticKeywords.slice(0, 30),
            content: htmlContent,
            imageDetails: [
                {
                    prompt: `Professional infographic about ${keyword}, modern design, data visualization, ${TARGET_YEAR} style`,
                    altText: `${keyword} comprehensive guide infographic`,
                    title: `${keyword} Guide`,
                    placeholder: '[IMAGE_1]'
                },
                {
                    prompt: `Expert explaining ${keyword} concepts, professional setting, educational`,
                    altText: `Expert analysis of ${keyword}`,
                    title: `${keyword} Expert Analysis`,
                    placeholder: '[IMAGE_2]'
                },
                {
                    prompt: `${keyword} comparison chart, professional data visualization, clean modern design`,
                    altText: `${keyword} comparison and analysis`,
                    title: `${keyword} Comparison`,
                    placeholder: '[IMAGE_3]'
                }
            ],
            strategy: {
                targetAudience: 'Professionals and enthusiasts seeking comprehensive, authoritative information',
                searchIntent: ultraAnalysis.serpGaps[0]?.searchIntent || 'Informational',
                competitorAnalysis: `Identified ${ultraAnalysis.serpGaps.length} content gaps from top 3 competitors`,
                contentAngle: 'Definitive authority resource with exclusive insights'
            },
            jsonLdSchema: {},
            socialMediaCopy: {
                twitter: `The ultimate ${keyword} guide for ${TARGET_YEAR}. Covers ${ultraAnalysis.serpGaps.length}+ topics competitors miss. #${keyword.replace(/\s+/g, '')}`,
                linkedIn: `I just published the most comprehensive guide on ${keyword} for ${TARGET_YEAR}. It covers ${ultraAnalysis.serpGaps.length}+ topics that top competitors don't address, backed by ${ultraAnalysis.dynamicReferences.size} authoritative sources.`
            },
            faqSection: ultraAnalysis.paaQuestions.slice(0, 7).map(q => ({
                question: q,
                answer: `Comprehensive answer addressing ${q} with expert insights and ${TARGET_YEAR} data.`
            })),
            keyTakeaways: ultraAnalysis.serpGaps.slice(0, 7).map(gap => gap.contentAngle || gap.keyword),
            outline: ultraAnalysis.serpGaps.map(gap => gap.suggestedHeading || gap.keyword),
            references: Array.from(ultraAnalysis.dynamicReferences.values())
                .flat()
                .slice(0, 10)
                .map(ref => ({
                    title: ref.title,
                    url: ref.url,
                    source: ref.domain,
                    year: parseInt(ref.publicationDate) || TARGET_YEAR
                }))
        };

        try {
            generatedContent.jsonLdSchema = generateFullSchema(
                generatedContent,
                context.siteInfo,
                context.geoTargeting
            );
        } catch (e) {
            console.error('[GodModeUltra] Schema generation error:', e);
        }

        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] ═══════════════════════════════════════` });
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] PIPELINE COMPLETE` });
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Word Count: ~${Math.round(htmlContent.length / 6)}` });
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Semantic Keywords: ${allSemanticKeywords.length}` });
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Competitor Gaps Covered: ${ultraAnalysis.serpGaps.length}` });
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Unique References: ${generatedContent.references?.length || 0}` });
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] ═══════════════════════════════════════` });

        return generatedContent;

    } catch (error) {
        console.error('[GodModeUltra] Pipeline error:', error);
        dispatch({ type: 'ADD_SYSTEM_LOG', payload: `[GOD MODE ULTRA] Pipeline error: ${error}` });
        return null;
    }
};

export { GodModeUltraEngine, GOD_MODE_ULTRA_PROMPTS };

export default {
    performGodModeUltraAnalysis,
    generateGodModeUltraContent,
    executeGodModeUltraPipeline,
    GodModeUltraEngine
};
