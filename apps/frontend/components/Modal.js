import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ModalContext = createContext(null);

function ModalOverlay({ children, onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9998] animate-fadeIn"
    >
      {children}
    </div>
  );
}

function ConfirmDialog({ title, message, confirmText, cancelText, variant, onConfirm, onCancel }) {
  const confirmBtnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';

  const iconColor = variant === 'danger' ? 'text-red-400' : 'text-blue-400';

  const icon = variant === 'danger' ? (
    <svg className={`w-6 h-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ) : (
    <svg className={`w-6 h-6 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-md mx-4 animate-scaleIn">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-gray-400 whitespace-pre-line">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-800/50 border-t border-gray-700 rounded-b-xl">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            {cancelText || 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 ${confirmBtnClass}`}
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PromptDialog({ title, message, placeholder, defaultValue, confirmText, cancelText, onConfirm, onCancel, inputType }) {
  const [value, setValue] = useState(defaultValue || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) onConfirm(value);
  };

  return (
    <ModalOverlay onClose={onCancel}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-md mx-4 animate-scaleIn">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {message && (
                  <p className="mt-2 text-sm text-gray-400">{message}</p>
                )}
                <input
                  ref={inputRef}
                  type={inputType || 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder || ''}
                  className="mt-3 w-full bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 bg-gray-800/50 border-t border-gray-700 rounded-b-xl">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              {cancelText || 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {confirmText || 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setModal({
        type: 'confirm',
        ...options,
        onConfirm: () => { setModal(null); resolve(true); },
        onCancel: () => { setModal(null); resolve(false); },
      });
    });
  }, []);

  const prompt = useCallback((options) => {
    return new Promise((resolve) => {
      setModal({
        type: 'prompt',
        ...options,
        onConfirm: (val) => { setModal(null); resolve(val); },
        onCancel: () => { setModal(null); resolve(null); },
      });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ confirm, prompt }}>
      {children}
      {modal?.type === 'confirm' && <ConfirmDialog {...modal} />}
      {modal?.type === 'prompt' && <PromptDialog {...modal} />}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
}
