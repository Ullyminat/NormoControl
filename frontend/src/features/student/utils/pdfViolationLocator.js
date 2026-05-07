const normalizeForSearch = (value) => {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .normalize('NFKC')
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}]+/gu, '');
};

const cleanSearchText = (value) => {
    if (!value) return '';
    return String(value)
        .replace(/\s+/g, ' ')
        .replace(/\.{3,}$/g, '')
        .trim();
};

export const getViolationKey = (violation) => `${violation.id}_${violation.position_in_doc || ''}`;

export const getViolationPage = (violation) => {
    const page = violation.position_in_doc?.match(/Page\s+(\d+)/i)?.[1];
    return page ? Number(page) : null;
};

export const getViolationParagraph = (violation) => {
    const paragraph = violation.position_in_doc?.match(/Para\s+(\d+)/i)?.[1];
    return paragraph ? Number(paragraph) : null;
};

export const getSearchableViolationText = (violation) => getSearchCandidates(violation).join(' ');

const getSearchCandidates = (violation) => {
    const positionText = violation.position_in_doc?.includes(':')
        ? violation.position_in_doc.split(':').slice(1).join(':')
        : '';

    return [
        violation.context_text,
        positionText,
        violation.actual_value,
        violation.expected_value,
        violation.description,
    ]
        .map(cleanSearchText)
        .filter((value, index, values) => value.length >= 4 && values.indexOf(value) === index)
        .sort((a, b) => b.length - a.length);
};

const waitForTextLayer = (pageDiv, timeoutMs = 2500) => new Promise((resolve) => {
    const startedAt = performance.now();

    const tick = () => {
        const textLayer = pageDiv?.querySelector('.react-pdf__Page__textContent');
        const pageRect = pageDiv?.getBoundingClientRect();
        const spans = textLayer ? Array.from(textLayer.querySelectorAll('span')) : [];
        const visibleTextSpans = spans.filter((span) => {
            const text = span.textContent?.trim();
            if (!text) return false;

            const rect = span.getBoundingClientRect();
            return rect.height > 0 || span.style.top || span.style.transform;
        });

        if (pageRect?.height > 100 && visibleTextSpans.length > 0) {
            requestAnimationFrame(() => resolve({ textLayer, spans: visibleTextSpans }));
            return;
        }

        if (performance.now() - startedAt > timeoutMs) {
            resolve({ textLayer, spans: visibleTextSpans });
            return;
        }

        requestAnimationFrame(tick);
    };

    tick();
});

const parsePx = (value) => {
    const parsed = Number.parseFloat(value || '');
    return Number.isFinite(parsed) ? parsed : null;
};

const yFromTransform = (transform) => {
    if (!transform) return null;

    const matrix = transform.match(/matrix\(([^)]+)\)/);
    if (matrix) {
        const parts = matrix[1].split(',').map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 6 && Number.isFinite(parts[5])) return parts[5];
    }

    const translate = transform.match(/translate(?:3d)?\([^,]+,\s*([-0-9.]+)px/i);
    if (translate) return Number.parseFloat(translate[1]);

    return null;
};

const getSpanY = (span, pageDiv) => {
    const rect = span.getBoundingClientRect();
    const pageRect = pageDiv.getBoundingClientRect();
    const rectY = rect.top - pageRect.top;

    if (Number.isFinite(rectY) && rect.height > 0 && rectY > 0.5) {
        return rectY;
    }

    const style = window.getComputedStyle(span);
    const top = parsePx(style.top) ?? parsePx(span.style.top);
    const transformY = yFromTransform(style.transform) ?? yFromTransform(span.style.transform);

    if (top !== null && transformY !== null) return top + transformY;
    if (top !== null) return top;
    if (transformY !== null) return transformY;
    if (Number.isFinite(rectY)) return Math.max(0, rectY);

    return 0;
};

const getSpanX = (span, pageDiv) => {
    const rect = span.getBoundingClientRect();
    const pageRect = pageDiv.getBoundingClientRect();
    const rectX = rect.left - pageRect.left;
    if (Number.isFinite(rectX) && rect.width > 0) return rectX;

    const style = window.getComputedStyle(span);
    return parsePx(style.left) ?? parsePx(span.style.left) ?? 0;
};

const buildPageIndex = (spans, pageDiv) => {
    const items = spans
        .map((span) => ({
            span,
            text: span.textContent || '',
            y: getSpanY(span, pageDiv),
            x: getSpanX(span, pageDiv),
        }))
        .filter((item) => item.text.trim().length > 0)
        .sort((a, b) => Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x);

    let fullText = '';
    const mapping = [];

    items.forEach((item) => {
        const normalized = normalizeForSearch(item.text);
        if (!normalized) return;

        mapping.push({
            start: fullText.length,
            end: fullText.length + normalized.length,
            item,
        });
        fullText += normalized;
    });

    return { fullText, mapping, items };
};

const findBestMatch = (pageIndex, candidates) => {
    for (const candidate of candidates) {
        const normalized = normalizeForSearch(candidate);
        if (normalized.length < 4) continue;

        const maxLength = Math.min(normalized.length, 120);
        const minLength = Math.min(8, maxLength);

        for (let length = maxLength; length >= minLength; length -= 4) {
            const slices = [
                normalized.slice(0, length),
                normalized.slice(Math.max(0, Math.floor((normalized.length - length) / 2)), Math.max(0, Math.floor((normalized.length - length) / 2)) + length),
            ];

            for (const slice of slices) {
                const index = pageIndex.fullText.indexOf(slice);
                if (index !== -1) {
                    return { start: index, end: index + slice.length, score: slice.length / maxLength, matchedLength: slice.length };
                }
            }
        }
    }

    return null;
};

const estimatePageMatchScore = (pageIndex, violation) => {
    const match = findBestMatch(pageIndex, getSearchCandidates(violation));
    return match ? match.matchedLength + match.score : 0;
};

const applyHighlight = (spans, violation) => {
    let bgColor = 'rgba(239, 68, 68, 0.32)';
    if (violation.severity === 'critical') bgColor = 'rgba(185, 28, 28, 0.42)';
    else if (violation.severity === 'warning') bgColor = 'rgba(245, 158, 11, 0.34)';
    else if (violation.severity === 'info') bgColor = 'rgba(59, 130, 246, 0.3)';

    spans.forEach((span) => {
        span.style.backgroundColor = bgColor;
        span.style.borderRadius = '3px';
        span.style.cursor = 'pointer';
        span.style.mixBlendMode = 'multiply';
        span.classList.add('violation-highlight');
        span.dataset.violationKey = getViolationKey(violation);
    });
};

const clearPageHighlights = (pageDiv) => {
    pageDiv.querySelectorAll('.violation-highlight').forEach((span) => {
        span.style.backgroundColor = '';
        span.style.borderRadius = '';
        span.style.cursor = '';
        span.style.mixBlendMode = '';
        span.classList.remove('violation-highlight');
        delete span.dataset.violationKey;
    });
};

const fallbackY = (violation, pageIndex, pageDiv, pageViolations) => {
    const pageHeight = pageDiv.getBoundingClientRect().height || 1200;
    const paragraph = getViolationParagraph(violation);
    const paragraphs = pageViolations
        .map(getViolationParagraph)
        .filter((value) => Number.isFinite(value));

    if (paragraph && paragraphs.length > 1) {
        const min = Math.min(...paragraphs);
        const max = Math.max(...paragraphs);
        if (max > min) {
            const ratio = (paragraph - min) / (max - min);
            return 70 + ratio * Math.max(80, pageHeight - 140);
        }
    }

    const index = pageViolations.findIndex((item) => item.id === violation.id);
    const count = Math.max(1, pageViolations.length);
    return 70 + ((index + 0.5) / count) * Math.max(80, pageHeight - 140);
};

export const locateViolationsOnPage = async (pageNumber, pageDiv, pageViolations) => {
    const results = {};
    if (!pageDiv || pageViolations.length === 0) return results;

    const { spans } = await waitForTextLayer(pageDiv);
    clearPageHighlights(pageDiv);

    if (!spans.length) {
        pageViolations.forEach((violation) => {
            results[getViolationKey(violation)] = {
                y: Math.round(fallbackY(violation, null, pageDiv, pageViolations)),
                confidence: 0.25,
                method: 'page_fallback',
                foundPageNum: pageNumber,
            };
        });
        return spreadMarkerRail(results, pageDiv);
    }

    const pageIndex = buildPageIndex(spans, pageDiv);

    pageViolations.forEach((violation) => {
        const key = getViolationKey(violation);
        const match = findBestMatch(pageIndex, getSearchCandidates(violation));

        if (match) {
            const overlapping = pageIndex.mapping
                .filter((entry) => entry.start < match.end && entry.end > match.start)
                .map((entry) => entry.item);

            if (overlapping.length > 0) {
                applyHighlight(overlapping.map((entry) => entry.span), violation);

                results[key] = {
                    y: Math.round(Math.min(...overlapping.map((entry) => entry.y))),
                    confidence: Math.max(0.72, Math.min(0.98, match.score)),
                    method: 'text_layer',
                    foundPageNum: pageNumber,
                };
                return;
            }
        }

        results[key] = {
            y: Math.round(fallbackY(violation, pageIndex, pageDiv, pageViolations)),
            confidence: 0.35,
            method: 'page_fallback',
            foundPageNum: pageNumber,
        };
    });

    return spreadMarkerRail(results, pageDiv);
};

export const chooseBestPagesForViolations = async (numPages, violations) => {
    const indexes = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
        if (!pageDiv) continue;

        const { spans } = await waitForTextLayer(pageDiv);
        if (!spans.length) continue;

        indexes.push({
            pageNum,
            pageIndex: buildPageIndex(spans, pageDiv),
        });
    }

    const result = {};

    violations.forEach((violation) => {
        const declaredPage = getViolationPage(violation);
        let best = { pageNum: declaredPage, score: 0 };

        indexes.forEach(({ pageNum, pageIndex }) => {
            const score = estimatePageMatchScore(pageIndex, violation);
            if (score > best.score) {
                best = { pageNum, score };
            }
        });

        if (best.pageNum) {
            result[getViolationKey(violation)] = best.pageNum;
        }
    });

    return result;
};

const spreadMarkerRail = (results, pageDiv) => {
    const pageHeight = pageDiv?.getBoundingClientRect().height || 1200;
    const minGap = 24;
    const padding = 12;
    const keys = Object.keys(results).sort((a, b) => results[a].y - results[b].y);

    let previousY = -Infinity;
    keys.forEach((key) => {
        const desiredY = Math.max(padding, Math.min(pageHeight - padding, results[key].y));
        const markerY = Math.max(desiredY, previousY + minGap);
        results[key].markerY = Math.min(markerY, pageHeight - padding);
        previousY = results[key].markerY;
    });

    for (let i = keys.length - 2; i >= 0; i--) {
        const current = results[keys[i]];
        const next = results[keys[i + 1]];
        if (next.markerY - current.markerY < minGap) {
            current.markerY = Math.max(padding, next.markerY - minGap);
        }
    }

    return results;
};
