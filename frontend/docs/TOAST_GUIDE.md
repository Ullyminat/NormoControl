# Toast Notifications - Руководство по Использованию

## Обзор

В приложении интегрирована библиотека `react-toastify` с кастомными стилями, адаптированными под швейцарский дизайн системы.

## Импорт

```javascript
import { showToast, toastMessages } from '@/utils/toast';
// или
import showToast from '@/utils/toast';
```

## Базовое Использование

### Типы Уведомлений

```javascript
// Успех (зеленый фон)
showToast.success('Операция выполнена успешно');

// Ошибка (красный фон)
showToast.error('Произошла ошибка');

// Предупреждение (оранжевый фон)
showToast.warning('Внимание! Проверьте данные');

// Информация (синий фон)
showToast.info('Новая информация доступна');

// По умолчанию (белый фон)
showToast.default('Обычное уведомление');
```

### Использование Предустановленных Сообщений

```javascript
import { showToast, toastMessages } from '@/utils/toast';

// Аутентификация
showToast.success(toastMessages.loginSuccess);
showToast.error(toastMessages.loginError);

// Операции с документами
showToast.success(toastMessages.uploadSuccess);
showToast.error(toastMessages.checkError);

// Операции со стандартами
showToast.success(toastMessages.standardCreated);
```

### Настройка Параметров

```javascript
showToast.success('Файл сохранен', {
  autoClose: 2000,        // Закрыть через 2 секунды
  hideProgressBar: true,  // Скрыть progress bar
  position: 'bottom-right' // Изменить позицию
});
```

### Promise Toast

Для асинхронных операций:

```javascript
const uploadPromise = fetch('/api/upload', {
  method: 'POST',
  body: formData
});

showToast.promise(uploadPromise, {
  pending: 'Загрузка файла...',
  success: 'Файл успешно загружен',
  error: 'Ошибка загрузки'
});
```

## Примеры Интеграции

### В Обработчике Формы

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  try {
    const response = await api.createStandard(formData);
    showToast.success(toastMessages.standardCreated);
    navigate('/standards');
  } catch (error) {
    showToast.error(error.message || toastMessages.genericError);
  }
};
```

### В API-вызовах

```javascript
const deleteStandard = async (id) => {
  try {
    await api.delete(`/standards/${id}`);
    showToast.success(toastMessages.deleteSuccess);
    fetchStandards(); // Обновить список
  } catch (error) {
    if (error.response?.status === 404) {
      showToast.error('Стандарт не найден');
    } else {
      showToast.error(toastMessages.deleteError);
    }
  }
};
```

### С Условиями

```javascript
const checkDocument = async (file) => {
  if (!file) {
    showToast.warning('Пожалуйста, выберите файл');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast.error('Файл слишком большой (макс. 10MB)');
    return;
  }

  try {
    const result = await api.checkDocument(file);
    showToast.success(toastMessages.checkSuccess);
    return result;
  } catch (error) {
    showToast.error(toastMessages.checkError);
  }
};
```

## Стилизация

### Цветовая Схема

- **Success**: `#E8F5E9` фон, `#008000` border
- **Error**: `#FFEBEE` фон, `#FF3B30` border
- **Warning**: `#FFF3E0` фон, `#FF9500` border
- **Info**: `#E3F2FD` фон, `#2196F3` border
- **Default**: `#FFFFFF` фон, `#000000` border

### Особенности Дизайна

- Без скругленных углов (`border-radius: 0`)
- Черные жирные границы (2px)
- Box-shadow для объемности
- Шрифт Inter
- Uppercase текст для заголовков

## Расположение

По умолчанию: `top-right`

Доступные позиции:
- `top-left`
- `top-center`
- `top-right` (по умолчанию)
- `bottom-left`
- `bottom-center`
- `bottom-right`

## Настройка Автозакрытия

```javascript
// Закрыть через 5 секунд
showToast.success('Сообщение', { autoClose: 5000 });

// Не закрывать автоматически
showToast.error('Важная ошибка', { autoClose: false });
```

## Добавление Новых Предустановленных Сообщений

Отредактируйте `src/utils/toast.js`:

```javascript
export const toastMessages = {
  // ... существующие
  
  // Добавьте новые
  customSuccess: 'Ваше кастомное сообщение',
  customError: 'Кастомная ошибка',
};
```

## Рекомендации

1. **Используйте предустановленные сообщения** для типовых операций
2. **Показывайте toast при успехе И при ошибке** для полной обратной связи
3. **Держите сообщения короткими** (1-2 строки максимум)
4. **Используйте правильный тип** (success/error/warning/info)
5. **Не злоупотребляйте** - показывайте только важные уведомления

## Интеграция в Новые Компоненты

```javascript
import { showToast, toastMessages } from '@/utils/toast';

function MyComponent() {
  const handleAction = async () => {
    try {
      await someAsyncOperation();
      showToast.success('Действие выполнено');
    } catch (error) {
      showToast.error(error.message || toastMessages.genericError);
    }
  };

  return (
    <button onClick={handleAction}>
      Выполнить
    </button>
  );
}
```

## Отладка

Для просмотра всех toast уведомлений, откройте React DevTools и найдите `ToastContainer` в дереве компонентов.

---

**Файлы:**
- Стили: `src/toastify-custom.css`
- Утилиты: `src/utils/toast.js`
- Интеграция: `src/App.jsx`
