import '../styles/globals.css';
import '@xterm/xterm/css/xterm.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import GlobalAIAssistant from '../components/GlobalAIAssistant';
import { ToastProvider } from '../components/Toast';
import { ModalProvider } from '../components/Modal';
import { installApiClient } from '../utils/apiClient';

// Attaches the bearer token to every API call and rewrites hardcoded
// localhost:8002 URLs to same-origin, so the UI works from another host.
// Runs before the first render on the client.
installApiClient();

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
