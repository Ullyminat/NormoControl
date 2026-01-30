/**
 * Enhanced Clustering Engine with validation and overlap prevention
 */

/**
 * Валидирует позицию маркера
 * @param {number} position - Позиция маркера
 * @param {number} pageHeight - Высота страницы
 * @returns {number} Валидная позиция
 */
export const validatePosition = (position, pageHeight) => {
    const TOP_MARGIN = 20;
    const BOTTOM_MARGIN = 20;
    const HEADER_ZONE = 50;
    const FOOTER_ZONE = 50;

    // Проверка базовых границ
    if (position < TOP_MARGIN) {
        position = TOP_MARGIN;
    }

    if (position > pageHeight - BOTTOM_MARGIN) {
        position = pageHeight - BOTTOM_MARGIN;
    }

    // Избегаем зону header/footer
    if (position < HEADER_ZONE) {
        position = HEADER_ZONE;
    }

    if (position > pageHeight - FOOTER_ZONE) {
        position = pageHeight - FOOTER_ZONE;
    }

    return position;
};

/**
 * Предотвращает наложение маркеров (recursive)
 * @param {number} position - Желаемая позиция
 * @param {Array<number>} existingPositions - Массив уже занятых позиций
 * @param {number} minGap - Минимальный gap между маркерами
 * @param {number} pageHeight - Высота страницы
 * @returns {number}
 */
export const preventOverlap = (position, existingPositions, minGap = 30, pageHeight = 1000) => {
    if (!existingPositions || existingPositions.length === 0) {
        return position;
    }

    // Сортируем существующие позиции
    const sorted = [...existingPositions].sort((a, b) => a - b);

    // Проверяем конфликты
    for (const existingPos of sorted) {
        const distance = Math.abs(position - existingPos);

        if (distance < minGap) {
            // Конфликт - смещаем вниз
            const newPosition = existingPos + minGap;

            // Проверяем, что не вышли за границы
            if (newPosition > pageHeight - 50) {
                // Пробуем сместить вверх
                return Math.max(20, existingPos - minGap);
            }

            // Recursive проверка на новой позиции
            return preventOverlap(newPosition, sorted.filter(p => p !== existingPos), minGap, pageHeight);
        }
    }

    return position;
};

/**
 * Оптимизирует позиции всех маркеров
 * @param {Array} violations - Массив нарушений
 * @param {Object} positions - Объект с позициями {key: position}
 * @param {number} pageHeight - Высота страницы
 * @returns {Object} Оптимизированные позиции
 */
export const optimizeMarkerPositions = (violations, positions, pageHeight) => {
    const optimized = {};
    const usedPositions = [];

    // Сортируем violations по исходной позиции
    const sortedViolations = violations
        .map(v => ({
            key: `${v.id}_${v.position_in_doc}`,
            violation: v,
            position: positions[`${v.id}_${v.position_in_doc}`] || 0
        }))
        .sort((a, b) => a.position - b.position);

    // Оптимизируем каждую позицию
    for (const item of sortedViolations) {
        let position = item.position;

        // Валидация
        position = validatePosition(position, pageHeight);

        // Предотвращение наложения
        position = preventOverlap(position, usedPositions, 30, pageHeight);

        optimized[item.key] = position;
        usedPositions.push(position);
    }

    return optimized;
};

/**
 * Создает кластеры из близких маркеров
 * @param {Array} markers - Массив объектов {violation, position}
 * @param {number} threshold - Порог расстояния для кластеризации
 * @returns {Array} Массив кластеров
 */
export const createClusters = (markers, threshold = 50) => {
    if (!markers || markers.length === 0) return [];

    // Сортируем по позиции
    const sorted = [...markers].sort((a, b) => a.position - b.position);

    const clusters = [];
    let currentCluster = {
        violations: [sorted[0].violation],
        position: sorted[0].position,
        count: 1
    };

    for (let i = 1; i < sorted.length; i++) {
        const distance = sorted[i].position - currentCluster.position;

        if (distance < threshold) {
            // Добавляем в текущий кластер
            currentCluster.violations.push(sorted[i].violation);
            currentCluster.count++;
            // Обновляем позицию кластера (среднее)
            currentCluster.position =
                (currentCluster.position * (currentCluster.count - 1) + sorted[i].position) / currentCluster.count;
        } else {
            // Создаем новый кластер
            clusters.push(currentCluster);
            currentCluster = {
                violations: [sorted[i].violation],
                position: sorted[i].position,
                count: 1
            };
        }
    }

    // Добавляем последний кластер
    clusters.push(currentCluster);

    return clusters;
};
