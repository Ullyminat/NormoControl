/**
 * Swiss Design Error Configuration
 * Минималистичная конфигурация в швейцарском стиле
 */

// Швейцарская палитра (черно-белая + акценты)
export const SWISS_COLORS = {
    black: '#000000',
    white: '#FFFFFF',
    gray900: '#1A1A1A',
    gray700: '#4A4A4A',
    gray500: '#808080',
    gray300: '#CCCCCC',
    gray100: '#F5F5F5',
    red: '#FF0000',      // Единственный цветной акцент
};

// Severity levels - минималистично
export const SEVERITY_CONFIG = {
    critical: {
        name: 'Критич.',
        priority: 1,
        marker: '■', // Квадрат
        color: SWISS_COLORS.black
    },
    error: {
        name: 'Ошибка',
        priority: 2,
        marker: '●', // Круг
        color: SWISS_COLORS.gray700
    },
    warning: {
        name: 'Предупр.',
        priority: 3,
        marker: '▲', // Треугольник
        color: SWISS_COLORS.gray500
    },
    info: {
        name: 'Инфо',
        priority: 4,
        marker: '○', // Пустой круг
        color: SWISS_COLORS.gray300
    }
};

// ПОЛНАЯ карта всех типов ошибок
export const ERROR_CATEGORIES = {
    margins: {
        name: 'Поля и отступы',
        types: [
            'margin_top',
            'margin_bottom',
            'margin_left',
            'margin_right',
            'header_dist',
            'footer_dist'
        ]
    },
    font: {
        name: 'Шрифты',
        types: [
            'font_name',
            'font_size'
        ]
    },
    paragraph: {
        name: 'Абзацы',
        types: [
            'line_spacing',
            'alignment',
            'indent',
            'spacing_before',
            'spacing_after'
        ]
    },
    typography: {
        name: 'Стили текста',
        types: [
            'style_bold',
            'style_italic',
            'style_underline',
            'style_caps',
            'text_case'
        ]
    },
    structure: {
        name: 'Структура',
        types: [
            'structure_break',
            'structure_hierarchy',
            'heading_hierarchy',
            'toc_page_mismatch',
            'toc_missing_heading',
            'section_numbering',
            'page_break',
            'section_order',
            'section_missing'
        ]
    },
    content: {
        name: 'Содержание',
        types: [
            'vocabulary',
            'doc_length',
            'intro_length',
            'conclusion_length',
            'section_length'
        ]
    },
    page_setup: {
        name: 'Параметры страницы',
        types: [
            'page_orientation',
            'page_size',
            'page_numbering'
        ]
    },
    tables: {
        name: 'Таблицы',
        types: [
            'table_alignment',
            'table_caption_missing',
            'table_caption_position',
            'table_caption_keyword',
            'table_caption_dash',
            'table_borders_missing',
            'table_header_missing',
            'table_row_height',
            'table_width'
        ]
    },
    formulas: {
        name: 'Формулы',
        types: [
            'formula_alignment',
            'formula_numbering_missing',
            'formula_spacing',
            'formula_where_colon'
        ]
    },
    other: {
        name: 'Прочее',
        types: [] // Catch-all для unmapped типов
    }
};

/**
 * Получить категорию для violation (с fallback)
 */
export const getCategoryConfig = (violation) => {
    if (!violation || !violation.rule_type) {
        return ERROR_CATEGORIES.other;
    }

    for (const [key, category] of Object.entries(ERROR_CATEGORIES)) {
        if (category.types.includes(violation.rule_type)) {
            return { ...category, key };
        }
    }

    // Fallback - если тип не найден, добавляем в "Прочее"
    console.warn(`Unmapped rule_type: ${violation.rule_type}`);
    return { ...ERROR_CATEGORIES.other, key: 'other' };
};

/**
 * Получить severity config
 */
export const getSeverityConfig = (violation) => {
    const severity = violation?.severity?.toLowerCase() || 'error';
    return SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.error;
};

/**
 * Категоризация всех violations
 */
export const categorizeViolations = (violations) => {
    const categorized = {};
    const unmappedTypes = new Set();

    violations.forEach(v => {
        const category = getCategoryConfig(v);
        const key = category.key;

        if (!categorized[key]) {
            categorized[key] = [];
        }
        categorized[key].push(v);

        // Отслеживаем unmapped типы
        if (key === 'other' && v.rule_type) {
            unmappedTypes.add(v.rule_type);
        }
    });

    // Логируем unmapped типы для анализа
    if (unmappedTypes.size > 0) {
        console.warn('Unmapped rule types:', Array.from(unmappedTypes));
    }

    return categorized;
};

/**
 * Статистика по severity
 */
export const assessOverallSeverity = (violations) => {
    const stats = {
        critical: 0,
        error: 0,
        warning: 0,
        info: 0,
        total: violations.length
    };

    violations.forEach(v => {
        const severity = v.severity?.toLowerCase() || 'error';
        if (stats[severity] !== undefined) {
            stats[severity]++;
        } else {
            stats.error++;
        }
    });

    // Расчет оценки (0-100)
    const score = Math.max(0, Math.min(100,
        100 - (stats.critical * 20 + stats.error * 5 + stats.warning * 2 + stats.info * 0.5)
    ));

    return { ...stats, score: Math.round(score) };
};

/**
 * Инструкции по исправлению
 */
export const getFixSuggestions = (violation) => {
    if (!violation || !violation.rule_type) return [];

    const suggestions = {
        margin_top: ['Разметка страницы → Поля → Верхнее = ' + (violation.expected_value || '20мм')],
        margin_bottom: ['Разметка страницы → Поля → Нижнее = ' + (violation.expected_value || '20мм')],
        margin_left: ['Разметка страницы → Поля → Левое = ' + (violation.expected_value || '30мм')],
        margin_right: ['Разметка страницы → Поля → Правое = ' + (violation.expected_value || '15мм')],
        font_name: ['Выделить все (Ctrl+A) → Шрифт: ' + (violation.expected_value || 'Times New Roman')],
        font_size: ['Выделить все (Ctrl+A) → Размер: ' + (violation.expected_value || '14пт')],
        line_spacing: ['Формат → Абзац → Интервал: ' + (violation.expected_value || '1.5')],
        alignment: ['Выделить текст → Ctrl+J (выравнивание по ширине)'],
        indent: ['Формат → Абзац → Отступ первой строки: ' + (violation.expected_value || '12.5мм')]
    };

    return suggestions[violation.rule_type] || ['Сравните ожидаемое и фактическое значение'];
};

/**
 * CSS для Swiss Design (минимум анимаций)
 */
export const generateSwissCSS = () => {
    return `
        * {
            box-sizing: border-box;
        }
        
        /* Простая анимация появления */
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        /* Hover underline эффект */
        .swiss-hover-underline {
            position: relative;
        }
        
        .swiss-hover-underline::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 0;
            height: 2px;
            background: ${SWISS_COLORS.black};
            transition: width 0.2s ease;
        }
        
        .swiss-hover-underline:hover::after {
            width: 100%;
        }
        /* Применяем шрифт GOST Type B к текстовому слою PDF */
        .react-pdf__Page__textContent span {
            font-family: "GOST Type B", "ISOCPEUR", Arial, sans-serif !important;
        }
    `;
};
