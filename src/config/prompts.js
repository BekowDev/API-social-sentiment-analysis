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
    const lines = String(options.lines || '')
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
        `Input data (exactly ${batchCount} comments, preserve order):`,
        lines,
        '',
        `Return STRICT JSON array with exactly ${batchCount} objects in the same order:`,
        '[',
        '  {',
        '    "sentiment": "positive|negative|neutral",',
        '    "score": 0.0,',
        '    "is_toxic": false,',
        '    "is_sarcastic": false,',
        '    "emotion": "joy|anger|sadness|admiration|neutral",',
        '    "themes": ["theme1", "theme2"],',
        '    "hidden_meaning": "",',
        '    "explanation": "short reason"',
        '  }',
        ']',
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
        '  "overall_sentiment": "positive|negative|neutral",',
        '  "overall_toxicity_level": "low|medium|high",',
        '  "top_themes": ["theme1", "theme2", "theme3"],',
        '  "audience_mood": "brief mood summary",',
        '  "risk_flags": ["flag1", "flag2"],',
        '  "final_summary": "2-5 sentences of final insight"',
        '}',
    ].join('\n')
}
