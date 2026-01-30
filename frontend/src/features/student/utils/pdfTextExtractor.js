/**
 * PDF Text Extractor - использует native PDF.js API для точных координат
 * Основано на react-pdf-highlighter подходе
 */

import { pdfjs } from 'react-pdf';

/**
 * Извлекает текстовый контент со ТОЧНЫМИ координатами из PDF страницы
 * @param {PDFPageProxy} page - PDF.js page proxy
 * @param {Object} viewport - PDF viewport
 * @returns {Promise<Array>} Массив текстовых элементов с coordinates
 */
export const getTextContentWithCoordinates = async (page, viewport) => {
    try {
        const textContent = await page.getTextContent();
        const textItems = [];

        textContent.items.forEach((item) => {
            // Извлекаем transformation matrix
            const transform = item.transform;

            // transform = [scaleX, skewY, skewX, scaleY, translateX, translateY]
            const [scaleX, skewY, skewX, scaleY, translateX, translateY] = transform;

            // Вычисляем позицию в PDF-координатах
            const x = translateX;
            const y = translateY;
            const width = item.width;
            const height = item.height || Math.abs(scaleY);

            // Трансформируем PDF координаты в viewport координаты
            const [vx1, vy1] = viewport.convertToViewportPoint(x, y);
            const [vx2, vy2] = viewport.convertToViewportPoint(x + width, y - height);

            textItems.push({
                str: item.str, // Текст
                x: vx1,         // X в viewport координатах
                y: vy2,         // Y в viewport координатах (top)
                width: vx2 - vx1,
                height: vy1 - vy2,
                transform: transform,
                fontName: item.fontName
            });
        });

        return textItems;
    } catch (error) {
        console.error('Error extracting text content:', error);
        return [];
    }
};

/**
 * Нормализует текст для сравнения
 */
const normalizeText = (text) => {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
};

/**
 * Находит текстовый элемент по строке поиска
 * @param {Array} textItems - Массив текстовых элементов с координатами
 * @param {string} searchText - Текст для поиска
 * @returns {Object|null} Найденный элемент или null
 */
export const findTextItemByString = (textItems, searchText) => {
    if (!textItems || !searchText) return null;

    const normalizedSearch = normalizeText(searchText);
    const snippet = normalizedSearch.slice(0, 50); // Первые 50 символов

    // Поиск точного совпадения
    for (let i = 0; i < textItems.length; i++) {
        const itemText = normalizeText(textItems[i].str);

        if (itemText.includes(snippet)) {
            return textItems[i];
        }
    }

    // Поиск по объединенным соседним элементам (многострочный текст)
    for (let i = 0; i < textItems.length - 2; i++) {
        const combinedText = normalizeText(
            textItems[i].str + ' ' +
            textItems[i + 1].str + ' ' +
            textItems[i + 2].str
        );

        if (combinedText.includes(snippet)) {
            return textItems[i];
        }
    }

    return null;
};

/**
 * Находит текстовый элемент по номеру параграфа
 * Группирует элементы в параграфы по Y-координате
 * @param {Array} textItems - Массив текстовых элементов
 * @param {number} paragraphNumber - Номер параграфа (1-indexed)
 * @returns {Object|null}
 */
export const findTextItemByParagraph = (textItems, paragraphNumber) => {
    if (!textItems || !paragraphNumber) return null;

    // Группируем элементы по параграфам (по Y-координате)
    const LINE_GAP_THRESHOLD = 15; // Порог для определения нового параграфа
    const paragraphs = [];
    let currentParagraph = [];
    let lastY = null;

    textItems.forEach((item) => {
        if (lastY === null || Math.abs(item.y - lastY) < LINE_GAP_THRESHOLD) {
            // Та же строка или близко
            currentParagraph.push(item);
        } else {
            // Новая строка
            if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph);
            }
            currentParagraph = [item];
        }
        lastY = item.y;
    });

    // Добавляем последний параграф
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }

    // Возвращаем первый элемент нужного параграфа
    const index = paragraphNumber - 1;
    if (index >= 0 && index < paragraphs.length) {
        return paragraphs[index][0]; // Первый элемент параграфа
    }

    return null;
};

/**
 * Загружает PDF документ и возвращает page proxy
 * @param {string} pdfUrl - URL PDF файла
 * @param {number} pageNumber - Номер страницы (1-indexed)
 * @returns {Promise<{page: PDFPageProxy, viewport: Object}>}
 */
export const loadPDFPage = async (pdfUrl, pageNumber) => {
    try {
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.0 });

        return { page, viewport, pdf };
    } catch (error) {
        console.error('Error loading PDF page:', error);
        return null;
    }
};
