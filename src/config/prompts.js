const MODE_PROMPT_RULES = {
    fast: [
        'Goal: quick sentiment snapshot.',
        'Focus only on sentiment, score and primary emotion.',
        'Keep explanation short and concrete.',
        'Do not over-interpret hidden intent.',
    ],
    deep: [
        'Goal: deep language analysis.',
        'Detect sentiment, toxicity, sarcasm and hidden intent.',
        'Identify key discussion themes and social signals.',
        'Differentiate criticism from constructive feedback.',
    ],
    full: [
        'Goal: full-spectrum multimodal analysis.',
        'Analyze sentiment, toxicity, sarcasm, hidden intent and key themes.',
        'If transcript is provided, treat it as primary context.',
        'If video context is provided, account for visual cues and scene details.',
    ],
}

const MODE_RESPONSE_NOTES = {
    fast: 'Return practical, compact labels for dashboard usage.',
    deep: 'Be strict and nuanced; avoid false positive toxicity.',
    full: 'Prioritize context coherence across comments, transcript and visuals.',
}

function normalizeMode(mode) {
    const safeMode = String(mode || 'fast')
        .toLowerCase()
        .trim()
    if (safeMode === 'deep' || safeMode === 'full') {
        return safeMode
    }
    return 'fast'
}

export function buildContextSummaryInstruction(options = {}) {
    const mode = normalizeMode(options.mode)
    const hasTranscript = Boolean(options.hasTranscript)
    const hasVideo = Boolean(options.hasVideo)

    let instruction =
        'Analyze post text and media context. Return STRICT JSON object: { "summary": "..." }. '

    if (mode === 'fast') {
        instruction +=
            'Keep it concise (2-4 sentences) with core topic and audience mood.'
    } else if (mode === 'deep') {
        instruction +=
            'Describe topic, communication style, possible implicit narrative and likely audience reaction.'
    } else {
        instruction +=
            'Provide comprehensive context with topic, visual scene interpretation, and transcript-aware framing.'
    }

    if (hasTranscript) {
        instruction +=
            ' Transcript is trusted context and must be incorporated into the summary.'
    }
    if (hasVideo) {
        instruction +=
            ' Video signal is available; include visible intent and emotional tone from visuals.'
    }

    return instruction
}

export function buildCommentsBatchPrompt(options = {}) {
    const mode = normalizeMode(options.mode)
    const contextSummary = String(options.contextSummary || '')
    const commentsJson = String(options.commentsJson || '[]')
    const batchCount = Number(options.batchCount) || 0
    const batchIndex = Number(options.batchIndex || 0)
    const totalBatches = Number(options.totalBatches || 1)
    const hasTranscript = Boolean(options.hasTranscript)
    const hasVideo = Boolean(options.hasVideo)

    const rules = MODE_PROMPT_RULES[mode]
    const responseNote = MODE_RESPONSE_NOTES[mode]

    const contextHints = []
    if (hasTranscript) {
        contextHints.push(
            '- Transcript context is provided. Use it to resolve ambiguous comments.',
        )
    }
    if (hasVideo) {
        contextHints.push(
            '- Visual context is provided. Consider visual irony and non-verbal cues.',
        )
    }
    if (contextHints.length === 0) {
        contextHints.push('- Work only with textual context and comments.')
    }

    return [
        'You are an expert analyst of social media comments (Telegram, YouTube).',
        'Respond with STRICT JSON only.',
        `Mode: ${mode.toUpperCase()}.`,
        `Batch ${batchIndex + 1} of ${totalBatches}.`,
        '',
        'Context summary:',
        contextSummary || '(empty)',
        '',
        'Rules:',
        ...rules.map((rule) => `- ${rule}`),
        ...contextHints,
        `- ${responseNote}`,
        '',
        `Input data (exactly ${batchCount} comments, preserve all ids):`,
        commentsJson,
        '',
        `Return STRICT JSON array with exactly ${batchCount} objects. NO markdown, NO extra text:`,
        '[',
        '  {',
        '    "id": "same id from input",',
        '    "sentiment": "positive|negative|neutral",',
        '    "confidence": 0',
        '  }',
        ']',
        'Constraints:',
        '- Use only ids from input.',
        '- confidence MUST be a number from 0 to 100 and reflect your real certainty.',
        '- Do not use fixed confidence values by sentiment; evaluate each comment independently.',
        '- Do not include any fields except id, sentiment, confidence.',
    ].join('\n')
}

export function buildReducePrompt(options = {}) {
    const mode = normalizeMode(options.mode)
    const contextSummary = String(options.contextSummary || '')
    const partialAnalysesJson = String(options.partialAnalysesJson || '[]')
    const hasTranscript = Boolean(options.hasTranscript)
    const hasVideo = Boolean(options.hasVideo)

    return [
        'You are a senior analytics summarizer.',
        `Mode: ${mode.toUpperCase()}.`,
        'Aggregate partial batch analyses into one final concise insight.',
        'You must produce business-readable conclusions for dashboard users.',
        '',
        'Context summary:',
        contextSummary || '(empty)',
        '',
        `Transcript provided: ${hasTranscript ? 'yes' : 'no'}.`,
        `Video context provided: ${hasVideo ? 'yes' : 'no'}.`,
        '',
        'Partial analyses JSON:',
        partialAnalysesJson,
        '',
        'Return STRICT JSON object:',
        '{',
        '  "mainConclusion": "2-3 concise sentences with overall conclusion",',
        '  "keyInsights": [',
        '    "specific fact or recommendation #1",',
        '    "specific fact or recommendation #2",',
        '    "specific fact or recommendation #3"',
        '  ]',
        '}',
        'Constraints:',
        '- keyInsights must contain 3 to 5 short bullet-style strings.',
        '- No markdown, no code block wrappers.',
    ].join('\n')
}

export function buildInsightsSummaryPrompt(options = {}) {
    const contextSummary = String(options.contextSummary || '')
    const analyzedCommentsJson = String(options.analyzedCommentsJson || '[]')
    const language = String(options.language || 'ru').toLowerCase()

    let languageInstruction =
        'Пиши на русском языке.'
    let contentInstruction =
        '  "content": "3-4 предложения на русском с общим выводом",'
    let pointsExamples = ['    "тезис 1",', '    "тезис 2",', '    "тезис 3"']

    if (language === 'en') {
        languageInstruction = 'Write in English.'
        contentInstruction =
            '  "content": "3-4 sentences in English with the overall conclusion",'
        pointsExamples = [
            '    "insight 1",',
            '    "insight 2",',
            '    "insight 3"',
        ]
    } else if (language === 'kk') {
        languageInstruction = 'Жауапты қазақ тілінде жаз.'
        contentInstruction =
            '  "content": "Қазақ тілінде 3-4 сөйлемдік жалпы қорытынды",'
        pointsExamples = [
            '    "тезис 1",',
            '    "тезис 2",',
            '    "тезис 3"',
        ]
    }

    return [
        'Ты аналитик пользовательских комментариев для маркетинговой команды.',
        'На основе массива уже проанализированных комментариев подготовь краткий конспект.',
        languageInstruction,
        '',
        'Контекст поста:',
        contextSummary || '(пусто)',
        '',
        'Проанализированные комментарии (JSON):',
        analyzedCommentsJson,
        '',
        'Верни СТРОГО JSON-объект без markdown и лишнего текста:',
        '{',
        contentInstruction,
        '  "keyPoints": [',
        ...pointsExamples,
        '  ]',
        '}',
        'Ограничения:',
        '- keyPoints: 3-4 конкретных инсайта.',
        '- Формулируй тезисы предметно, без воды.',
    ].join('\n')
}
