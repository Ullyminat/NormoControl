/**
 * Precise Text Locator - Точное позиционирование ошибок в PDF
 * 
 * Многоуровневая система поиска текста в PDF.js text layer:
 * Level 1: Точное совпадение actual_value
 * Level 2: Поиск по первым 50 символам
 * Level 3: Fuzzy поиск по ключевым словам
 * Level 4: Поиск с учетом переносов строк
 * Level 5: Fallback - позиционирование по параграфу
 */

/**
 * Нормализует текст для сравнения
 */
const normalizeText = (text) => {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[—–-]/g, '-') // Унифицируем тире
        .trim();
};

/**
 * Извлекает ключевые слова из текста
 */
const extractKeywords = (text, maxCount = 5) => {
    if (!text) return [];

    const stopWords = new Set([
        'и', 'в', 'на', 'с', 'по', 'для', 'от', 'к', 'из', 'о', 'во', 'не', 'что', 'это', 'как', 'его', 'но', 'да',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are'
    ]);

    const words = normalizeText(text).match(/[а-яёa-z]+/gi) || [];

    return words
        .filter(word => word.length > 3 && !stopWords.has(word))
        .slice(0, maxCount);
};

/**
 * Извлекает контекст для поиска из violation
 */
const extractSearchContext = (violation) => {
    // Приоритет: actual_value > expected_value > description
    const contexts = [];

    if (violation.actual_value && violation.actual_value.trim().length > 0) {
        contexts.push({
            text: violation.actual_value,
            confidence: 1.0,
            source: 'actual_value'
        });
    }

    if (violation.expected_value && violation.expected_value.trim().length > 0) {
        contexts.push({
            text: violation.expected_value,
            confidence: 0.8,
            source: 'expected_value'
        });
    }

    // Извлекаем номер параграфа как fallback
    const paraMatch = violation.position_in_doc?.match(/Para\s+(\d+)/i);
    const paragraphNumber = paraMatch ? parseInt(paraMatch[1]) : null;

    return {
        contexts,
        paragraphNumber,
        position_in_doc: violation.position_in_doc
    };
};

/**
 * Level 1: Точное совпадение текста
 */
const searchExactMatch = (spans, searchText) => {
    if (!spans || !searchText) return null;

    const normalized = normalizeText(searchText);
    const snippet = normalized.slice(0, 50); // Первые 50 символов

    for (const span of spans) {
        const spanText = normalizeText(span.textContent);
        if (spanText.includes(snippet) && spanText.length > 0) {
            return {
                element: span,
                confidence: 1.0,
                method: 'exact_match'
            };
        }
    }

    return null;
};

/**
 * Level 2: Поиск по короткому фрагменту
 */
const searchShortSnippet = (spans, searchText) => {
    if (!spans || !searchText) return null;

    const normalized = normalizeText(searchText);
    const snippet = normalized.slice(0, 20); // Первые 20 символов

    if (snippet.length < 5) return null;

    for (const span of spans) {
        const spanText = normalizeText(span.textContent);
        if (spanText.includes(snippet)) {
            return {
                element: span,
                confidence: 0.9,
                method: 'short_snippet'
            };
        }
    }

    return null;
};

/**
 * Level 3: Fuzzy поиск по ключевым словам
 */
const searchByKeywords = (spans, searchText) => {
    if (!spans || !searchText) return null;

    const keywords = extractKeywords(searchText);
    if (keywords.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (let i = 0; i < spans.length; i++) {
        // Окно из 3 spans для контекста
        const windowText = normalizeText(
            spans.slice(Math.max(0, i - 1), Math.min(spans.length, i + 3))
                .map(s => s.textContent)
                .join(' ')
        );

        const matchCount = keywords.filter(kw => windowText.includes(kw)).length;
        const score = matchCount / keywords.length;

        if (score > bestScore) {
            bestScore = score;
            bestMatch = spans[i];
        }
    }

    if (bestScore > 0.6) {
        return {
            element: bestMatch,
            confidence: bestScore,
            method: 'keyword_match'
        };
    }

    return null;
};

/**
 * Level 4: Поиск с учетом переносов строк
 */
const searchMultiLine = (spans, searchText) => {
    if (!spans || !searchText) return null;

    const normalized = normalizeText(searchText);
    const snippet = normalized.slice(0, 40);

    // Объединяем до 5 последовательных spans
    for (let i = 0; i < spans.length - 4; i++) {
        const combined = normalizeText(
            spans.slice(i, i + 5)
                .map(s => s.textContent)
                .join(' ')
        );

        if (combined.includes(snippet)) {
            return {
                element: spans[i],
                confidence: 0.85,
                method: 'multiline_match'
            };
        }
    }

    return null;
};

/**
 * Level 5: Fallback - позиционирование по параграфу
 */
const positionByParagraph = (spans, paragraphNumber, pageHeight) => {
    if (!paragraphNumber || paragraphNumber < 1) return null;

    // Простая эвристика: разделяем spans на примерные параграфы
    const estimatedParasOnPage = Math.max(Math.floor(spans.length / 10), 5);
    const spansPerPara = Math.floor(spans.length / estimatedParasOnPage);
    const targetIndex = Math.min((paragraphNumber - 1) * spansPerPara, spans.length - 1);

    if (targetIndex >= 0 && targetIndex < spans.length) {
        return {
            element: spans[targetIndex],
            confidence: 0.5,
            method: 'paragraph_estimate'
        };
    }

    return null;
};

/**
 * Получает Y-координату элемента относительно страницы
 */
const getElementYPosition = (element, pageDiv) => {
    if (!element || !pageDiv) return null;


    try {
        const elementRect = element.getBoundingClientRect();
        const pageRect = pageDiv.getBoundingClientRect();
        return elementRect.top - pageRect.top;
    } catch (e) {
        console.error('Error getting element position:', e);
        return null;
    }
};

/**
 * ПРОСТОЙ И НАДЁЖНЫЙ МЕТОД: Позиционирование по номеру параграфа
 * Сортируем все spans по Y-координате и делим на равные части
 */
export const findPreciseTextPosition = (violation, textLayer, pageDiv, pageHeight) => {
    console.log(`🔍 "${violation.description?.slice(0, 50)}..."`);

    // Извлекаем номер параграфа
    const paraMatch = violation.position_in_doc?.match(/Para\s+(\d+)/i);
    const paragraphNumber = paraMatch ? parseInt(paraMatch[1]) : null;

    console.log(`   Para: ${paragraphNumber}, pos: ${violation.position_in_doc}`);

    if (!textLayer || !pageDiv) {
        return { y: null, confidence: 0, method: 'no_layer', found: false };
    }

    const spans = Array.from(textLayer.querySelectorAll('span'));
    if (spans.length === 0) {
        return { y: null, confidence: 0, method: 'no_spans', found: false };
    }

    console.log(`   ${spans.length} spans found`);

    // Если нет номера параграфа - фоллбэк
    if (!paragraphNumber || paragraphNumber < 1) {
        return { y: null, confidence: 0, method: 'no_para', found: false };
    }

    // МЕТОД: Сортируем все spans по Y-координате
    const spansWithY = [];
    const pageRect = pageDiv.getBoundingClientRect();

    spans.forEach(span => {
        try {
            const rect = span.getBoundingClientRect();
            // Вычисляем относительную позицию на странице
            const relativeY = rect.top - pageRect.top;

            // Фильтруем spans которые видимы на странице
            if (relativeY >= 0 && relativeY <= pageHeight && rect.width > 0) {
                spansWithY.push({
                    span: span,
                    y: relativeY,
                    text: span.textContent || ''
                });
            }
        } catch (e) {
            // Пропускаем проблемные spans
        }
    });

    if (spansWithY.length === 0) {
        console.log('   ⚠️ No valid spans with positions');
        return { y: null, confidence: 0, method: 'no_valid_spans', found: false };
    }

    // НОВЫЙ ПОДХОД: Извлекаем текст из position_in_doc
    // Формат: "Page 1, Para 14:     options = Options()..."
    // Нам нужна часть ПОСЛЕ двоеточия
    let searchText = '';

    // ОТЛАДКА: Смотрим что вообще есть в violation
    console.log('   📋 violation fields:', {
        position_in_doc: violation.position_in_doc,
        actual_value: violation.actual_value,
        expected_value: violation.expected_value,
        description: violation.description,
        all_keys: Object.keys(violation)
    });

    // Сначала пробуем извлечь из position_in_doc
    if (violation.position_in_doc && violation.position_in_doc.includes(':')) {
        const parts = violation.position_in_doc.split(':');
        if (parts.length > 1) {
            searchText = parts.slice(1).join(':').trim(); // Берём всё после первого ":"
            console.log(`   ✂️ Extracted from position_in_doc: "${searchText}"`);
        }
    }

    // Если не нашли - пробуем actual_value или expected_value  
    if (!searchText || searchText.length < 3) {
        searchText = (violation.actual_value || violation.expected_value || '').trim();
        if (searchText) {
            console.log(`   ✂️ Using actual/expected_value: "${searchText}"`);
        }
    }

    if (!searchText || searchText.length < 3) {
        console.log('   ⚠️ No searchable text');
        return { y: null, confidence: 0, method: 'no_text', found: false };
    }

    // Убираем trailing многоточие, которое добавляет backend при обрезке
    searchText = searchText.replace(/\.\.\.+$/, '').trim();

    // Берём первые 20 символов для поиска
    const query = searchText.slice(0, 20).trim();
    console.log(`   🔍 Searching for: "${query}..."`);

    // ОТЛАДКА: Показываем первые 5 span'ов
    console.log('   📄 First 5 spans from PDF:', spansWithY.slice(0, 5).map(s => s.text.slice(0, 30)));

    // Ищем в spans
    let bestMatch = null;
    let bestMatchScore = 0;

    spansWithY.forEach((item, index) => {
        // Нормализуем пробелы: убираем ведущие/концевые, заменяем множественные на одиночные
        const normalizeWhitespace = (text) => text.trim().replace(/\s+/g, ' ');

        const spanText = normalizeWhitespace(item.text.toLowerCase());
        const queryLower = normalizeWhitespace(query.toLowerCase());

        // ОТЛАДКА: показываем первое сравнение
        if (index === 0) {
            console.log(`   🔎 Normalized query: "${queryLower}"`);
            console.log(`   🔎 First span normalized: "${spanText}"`);
            console.log(`   🔎 StartsWith? ${spanText.startsWith(queryLower)}`);
        }

        // Точное совпадение начала
        if (spanText.startsWith(queryLower)) {
            if (queryLower.length > bestMatchScore) {
                bestMatch = item;
                bestMatchScore = queryLower.length;
            }
        }
        // Содержит текст
        else if (spanText.includes(queryLower) && queryLower.length > 10) {
            if (queryLower.length > bestMatchScore) {
                bestMatch = item;
                bestMatchScore = queryLower.length * 0.8;
            }
        }

        // Пробуем склеить с 1-2 следующими spans (для multi-word queries)
        if (index < spansWithY.length - 1) {
            const nextSpan = spansWithY[index + 1];
            const combined2 = normalizeWhitespace((item.text + ' ' + nextSpan.text).toLowerCase());

            if (combined2.startsWith(queryLower) || combined2.includes(queryLower)) {
                const score = queryLower.length * 0.9; // Немного ниже чем exact match
                if (score > bestMatchScore) {
                    bestMatch = item; // Возвращаем позицию первого span'а
                    bestMatchScore = score;
                }
            }

            // Пробуем 3 span'а
            if (index < spansWithY.length - 2) {
                const thirdSpan = spansWithY[index + 2];
                const combined3 = normalizeWhitespace((item.text + ' ' + nextSpan.text + ' ' + thirdSpan.text).toLowerCase());

                if (combined3.startsWith(queryLower) || combined3.includes(queryLower)) {
                    const score = queryLower.length * 0.85;
                    if (score > bestMatchScore) {
                        bestMatch = item;
                        bestMatchScore = score;
                    }
                }
            }
        }
    });

    if (bestMatch && bestMatchScore > 5) {
        const y = bestMatch.y;
        const confidence = Math.min(0.95, bestMatchScore / 20);

        console.log(`   ✅ ${Math.round(y)}px (match: "${bestMatch.text.slice(0, 20)}...", conf: ${Math.round(confidence * 100)}%)`);

        return {
            y: y,
            confidence: confidence,
            method: 'text_search',
            found: true
        };
    }

    console.log(`   ⚠️ Text not found on page`);

    // FALLBACK: Если ничего не нашли - распределяем по вертикали
    return {
        y: null,
        confidence: 0.3,
        method: 'not_found',
        found: true
    };
};

/**
 * Batch-поиск всех ошибок на странице
 */
export const findAllViolationsOnPage = (violations, textLayer, pageDiv, pageHeight) => {
    const results = {};
    violations.forEach(violation => {
        const key = `${violation.id}_${violation.position_in_doc}`;
        results[key] = findPreciseTextPosition(violation, textLayer, pageDiv, pageHeight);
    });
    return results;
};
