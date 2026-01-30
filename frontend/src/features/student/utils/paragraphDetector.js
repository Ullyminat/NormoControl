/**
 * Paragraph Detector - определение границ параграфов в PDF
 */

/**
 * Определяет параграфы на основе spans
 * @param {Array} spans - Массив span элементов из text layer
 * @returns {Array<{startY: number, endY: number, spans: Array}>}
 */
export const detectParagraphs = (spans) => {
    if (!spans || spans.length === 0) return [];

    const paragraphs = [];
    let currentParagraph = {
        startY: null,
        endY: null,
        spans: []
    };

    const LINE_HEIGHT_THRESHOLD = 20; // Порог для определения новой строки

    for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        const rect = span.getBoundingClientRect();
        const spanTop = rect.top;

        if (currentParagraph.spans.length === 0) {
            // Первый span в параграфе
            currentParagraph.startY = spanTop;
            currentParagraph.endY = spanTop + rect.height;
            currentParagraph.spans.push(span);
        } else {
            const lastSpanBottom = currentParagraph.endY;
            const gap = spanTop - lastSpanBottom;

            if (gap > LINE_HEIGHT_THRESHOLD) {
                // Большой gap - новый параграф
                paragraphs.push({ ...currentParagraph });
                currentParagraph = {
                    startY: spanTop,
                    endY: spanTop + rect.height,
                    spans: [span]
                };
            } else {
                // Продолжение текущего параграфа
                currentParagraph.endY = Math.max(currentParagraph.endY, spanTop + rect.height);
                currentParagraph.spans.push(span);
            }
        }
    }

    // Добавляем последний параграф
    if (currentParagraph.spans.length > 0) {
        paragraphs.push(currentParagraph);
    }

    return paragraphs;
};

/**
 * Получить позицию параграфа по его номеру
 * @param {Array} paragraphs - Массив параграфов
 * @param {number} paragraphNumber - Номер параграфа (1-indexed)
 * @param {Element} pageDiv - Контейнер страницы
 * @returns {number|null}
 */
export const getParagraphPosition = (paragraphs, paragraphNumber, pageDiv) => {
    if (!paragraphs || paragraphs.length === 0 || !paragraphNumber) return null;

    const index = paragraphNumber - 1; // Конвертируем в 0-indexed

    if (index < 0 || index >= paragraphs.length) {
        // Параграф вне диапазона - используем интерполяцию
        return null;
    }

    const paragraph = paragraphs[index];
    const pageRect = pageDiv.getBoundingClientRect();

    // Возвращаем середину параграфа
    const absoluteTop = paragraph.startY;
    const relativeTop = absoluteTop - pageRect.top;

    return relativeTop + (paragraph.endY - paragraph.startY) / 2;
};

/**
 * Извлечь номер параграфа из position_in_doc
 * @param {string} positionInDoc - Строка вида "Page 1, Para 3"
 * @returns {number|null}
 */
export const extractParagraphNumber = (positionInDoc) => {
    if (!positionInDoc) return null;

    const match = positionInDoc.match(/Para\s+(\d+)/i);
    return match ? parseInt(match[1]) : null;
};
