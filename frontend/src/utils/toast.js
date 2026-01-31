import { toast } from 'react-toastify';

/**
 * Utility functions for showing toast notifications
 * Adapted to Swiss design system aesthetic
 */

const toastConfig = {
    position: 'bottom-right',
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    closeButton: false,
};

export const showToast = {
    success: (message, options = {}) => {
        toast.success(message, {
            ...toastConfig,
            ...options,
        });
    },

    error: (message, options = {}) => {
        toast.error(message, {
            ...toastConfig,
            ...options,
        });
    },

    warning: (message, options = {}) => {
        toast.warning(message, {
            ...toastConfig,
            ...options,
        });
    },

    info: (message, options = {}) => {
        toast.info(message, {
            ...toastConfig,
            ...options,
        });
    },

    default: (message, options = {}) => {
        toast(message, {
            ...toastConfig,
            ...options,
        });
    },

    promise: async (promise, messages, options = {}) => {
        return toast.promise(
            promise,
            {
                pending: messages.pending || 'Обработка...',
                success: messages.success || 'Успешно!',
                error: messages.error || 'Ошибка',
            },
            {
                ...toastConfig,
                ...options,
            }
        );
    },
};

// Preset messages for common actions
export const toastMessages = {
    // Auth
    loginSuccess: 'Вход выполнен успешно',
    loginError: 'Ошибка входа. Проверьте данные',
    logoutSuccess: 'Выход выполнен',
    registerSuccess: 'Регистрация завершена',
    registerError: 'Ошибка регистрации',

    // Document operations
    uploadSuccess: 'Документ загружен',
    uploadError: 'Ошибка загрузки документа',
    checkSuccess: 'Проверка завершена',
    checkError: 'Ошибка при проверке документа',

    // Standard operations
    standardCreated: 'Стандарт создан',
    standardUpdated: 'Стандарт обновлен',
    standardDeleted: 'Стандарт удален',
    standardError: 'Ошибка при работе со стандартом',

    // General
    saveSuccess: 'Сохранено',
    saveError: 'Ошибка сохранения',
    deleteSuccess: 'Удалено',
    deleteError: 'Ошибка удаления',
    genericError: 'Произошла ошибка',
    networkError: 'Ошибка сети. Проверьте подключение',
};

export default showToast;
