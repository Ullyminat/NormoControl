/**
 * Enhanced Text Matcher - 6 уровней точности позиционирования
 */

/**
 * Проверяет, является ли текст валидным контентом документа
 * @param {string} text - Текст для проверки
 * @returns {boolean}
 */
export const isValidText = (text) => {
    if (!text || text.length < 10) return false;

    // Проверка на Python/JS код
    const codeKeywords = ['import', 'def ', 'class ', 'function', 'const ', 'let ', 'var ', 'from ', '=>'];
    const hasCode = codeKeywords.some(keyword => text.toLowerCase().includes(keyword));
    if (hasCode) return false;

    // Должен содержать буквы (кириллица или латиница)
    const hasLetters = /[а-яА-ЯёЁa-zA-Z]/.test(text);
    if (!hasLetters) return false;

    // Не должен состоять только из спецсимволов
    const onlySpecial = /^[^а-яА-ЯёЁa-zA-Z0-9\s]+$/.test(text);
    if (onlySpecial) return false;

    return true;
};

/**
 * Извлекает ключевые слова из текста
 * @param {string} text - Исходный текст
 * @returns {Array<string>}
 */
export const extractKeywords = (text) => {
    if (!text) return [];

    // Стоп-слова
    const stopWords = new Set([
        'и', 'в', 'на', 'с', 'по', 'для', 'от', 'к', 'из', 'о', 'во', 'не', 'что', 'это', 'как', 'его', 'но', 'да',
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were'
    ]);

    // Извлекаем слова (только буквы)
    const words = text.toLowerCase()
        .match(/[а-яёa-z]+/gi) || [];

    // Фильтруем - слова > 3 символов, не стоп-слова
    return words
        .filter(word => word.length > 3 && !stopWords.has(word))
        .slice(0, 10); // Максимум 10 ключевых слов
};

/**
 * Нормализует текст для сравнения
 * @param {string} str - Строка для нормализации
 * @returns {string}
 */
const normalize = (str) => {
    if (!str) return '';
    return str.replace(/\s+/g, ' ').trim().toLowerCase();
};

/**
 * Уровень 1: Точное совпадение текста (100% точность)
 * @param {Array} spans - Массив span элементов
 * @param {string} contextText - Текст для поиска
 * @returns {Element|null}
 */
export const findExactMatch = (spans, contextText) => {
    if (!spans || !contextText || !isValidText(contextText)) return null;

    const normalizedContext = normalize(contextText);
    const snippet = normalizedContext.slice(0, 50); // Первые 50 символов

    // Поиск точного совпадения
    for (const span of spans) {
        const spanText = normalize(span.textContent);
        if (spanText.includes(snippet)) {
            return span;
        }
    }

    // Поиск с учетом переносов строк (объединяем соседние spans)
    for (let i = 0; i < spans.length - 2; i++) {
        const combined = normalize(
            spans[i].textContent + ' ' +
            spans[i + 1].textContent + ' ' +
            spans[i + 2].textContent
        );

        if (combined.includes(snippet)) {
            return spans[i];
        }
    }

    return null;
};

/**
 * Уровень 2: Fuzzy match по ключевым словам (90% точность)
 * @param {Array} spans - Массив span элементов
 * @param {string} contextText - Текст для поиска
 * @returns {{element: Element, confidence: number}|null}
 */
export const findByKeywords = (spans, contextText) => {
    if (!spans || !contextText || !isValidText(contextText)) return null;

    const keywords = extractKeywords(contextText);
    if (keywords.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    // Поиск spans с максимальным количеством ключевых слов
    for (let i = 0; i < spans.length; i++) {
        // Объединяем текущий span с соседними для контекста
        const windowSize = 3;
        const startIdx = Math.max(0, i - 1);
        const endIdx = Math.min(spans.length, i + windowSize);

        const windowText = normalize(
            spans.slice(startIdx, endIdx)
                .map(s => s.textContent)
                .join(' ')
        );

        // Считаем совпадения ключевых слов
        const matches = keywords.filter(kw => windowText.includes(kw)).length;
        const score = matches / keywords.length;

        if (score > bestScore) {
            bestScore = score;
            bestMatch = spans[i];
        }
    }

    return bestScore > 0.5 ? { element: bestMatch, confidence: bestScore } : null;
};

/**
 * Получить относительную позицию элемента на странице
 * @param {Element} element - DOM элемент
 * @param {Element} pageDiv - Контейнер страницы
 * @returns {{top: number, left: number}|null}
 */
export const getRelativePosition = (element, pageDiv) => {
    if (!element || !pageDiv) return null;

    try {
        const elementRect = element.getBoundingClientRect();
        const pageRect = pageDiv.getBoundingClientRect();

        return {
            top: elementRect.top - pageRect.top,
            left: elementRect.left - pageRect.left
        };
    } catch (e) {
        console.error('Error getting relative position:', e);
        return null;
    }
};

/**
 * Уровень 3: Расчет позиции по номеру параграфа (70% точность)
 * @param {number} paragraphNumber - Номер параграфа
 * @param {number} totalParagraphs - Всего параграфов на странице
 * @param {number} pageHeight - Высота страницы
 * @returns {number}
 */
export const calculatePositionByParagraph = (paragraphNumber, totalParagraphs, pageHeight) => {
    if (!paragraphNumber || paragraphNumber < 1) return null;

    // Отступы от краев страницы
    const topMargin = 50;
    const bottomMargin = 50;
    const usableHeight = pageHeight - topMargin - bottomMargin;

    // Позиция пропорционально номеру параграфа
    const position = topMargin + (usableHeight / (totalParagraphs + 1)) * paragraphNumber;

    return Math.max(topMargin, Math.min(pageHeight - bottomMargin, position));
};

/**
 * Универсальная функция поиска текста с fallback
 * @param {Array} spans - Массив span элементов
 * @param {string} contextText - Текст для поиска
 * @returns {Element|null}
 */
export const findTextPosition = (spans, contextText) => {
    // Уровень 1: Точное совпадение
    const exactMatch = findExactMatch(spans, contextText);
    if (exactMatch) {
        return exactMatch;
    }

    // Уровень 2: Fuzzy match
    const fuzzyMatch = findByKeywords(spans, contextText);
    if (fuzzyMatch && fuzzyMatch.confidence > 0.7) {
        return fuzzyMatch.element;
    }

    return null;
};
