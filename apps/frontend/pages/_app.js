import '../styles/globals.css';
import '@xterm/xterm/css/xterm.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import GlobalAIAssistant from '../components/GlobalAIAssistant';
import { ToastProvider } from '../components/Toast';
import { ModalProvider } from '../components/Modal';

function MyApp({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ModalProvider>
          <Component {...pageProps} />
          <GlobalAIAssistant />
        </ModalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default MyApp;


