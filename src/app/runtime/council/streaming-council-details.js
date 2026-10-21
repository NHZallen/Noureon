export const getOpenCouncilDetailKeys = (root) => new Set(
    Array.from(root?.querySelectorAll('details.council-collapse[open] > summary') || [])
        .map(summary => summary.textContent.trim())
        .filter(Boolean)
);

export const restoreOpenCouncilDetails = (root, openKeys) => {
    if (!root || !openKeys?.size) return;
    root.querySelectorAll('details.council-collapse > summary').forEach(summary => {
        if (openKeys.has(summary.textContent.trim())) {
            summary.parentElement.open = true;
        }
    });
};

export const isCouncilComparisonSummary = (summaryText = '') => /共識與差異整理|Consensus|Differences|差異/i.test(summaryText);

export const normalizeCouncilComparisonDetails = (text = '') => {
    const source = String(text || '');
    const detailPattern = /(<details\b[^>]*class=["'][^"']*\bcouncil-collapse\b[^"']*["'][^>]*>\s*<summary>([^<]*)<\/summary>)([\s\S]*?)(<\/details>)/i;
    const match = detailPattern.exec(source);
    if (!match || !isCouncilComparisonSummary(match[2])) return source;

    const afterStart = match.index + match[0].length;
    const after = source.slice(afterStart);
    const nextSectionMatch = /\n\s*<details\b[^>]*class=["'][^"']*\bcouncil-collapse\b/i.exec(after);
    const scanLimit = nextSectionMatch ? nextSectionMatch.index : after.length;
    const scanText = after.slice(0, scanLimit);
    const lines = scanText.split('\n');
    const strayLines = [];
    let consumedLength = 0;
    let started = false;

    for (const line of lines) {
        const rawLineLength = line.length + 1;
        const trimmed = line.trim();
        const isTableish = /^\|/.test(trimmed) || /^\*\*[^*]+\*\*\s*\|/.test(trimmed) || /^[-*]\s+/.test(trimmed);
        const isBlank = trimmed === '';
        if (!started && isBlank) {
            consumedLength += rawLineLength;
            continue;
        }
        if (isTableish || (started && isBlank)) {
            started = true;
            strayLines.push(line);
            consumedLength += rawLineLength;
            continue;
        }
        break;
    }

    const strayText = strayLines.join('\n').trim();
    if (!strayText) return source;

    const before = source.slice(0, match.index);
    const fixedDetails = `${match[1]}${match[3].trimEnd()}\n\n${strayText}\n${match[4]}`;
    const rest = after.slice(consumedLength);
    return `${before}${fixedDetails}${rest}`;
};

export const hasUnclosedCouncilDetails = (text = '') => {
    const source = String(text || '');
    const opens = (source.match(/<details\b[^>]*class=["'][^"']*\bcouncil-collapse\b[^"']*["'][^>]*>/gi) || []).length;
    const closes = (source.match(/<\/details>/gi) || []).length;
    return opens > closes;
};
