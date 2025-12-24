'use client';

import { ReactNode, useEffect, useState } from 'react';
import { initApp } from '@multiversx/sdk-dapp/out/methods/initApp/initApp';
import { EnvironmentsEnum } from '@multiversx/sdk-dapp/out/types/enums.types';
import { ThemesEnum } from '@multiversx/sdk-dapp/out/types/theme.types';
import { network, walletConnectV2ProjectId } from '@/config';
import { BatchTransactionsContextProvider } from '@/wrappers/BatchTransactionsContextProvider';

// Initialize MultiversX dapp config once on the client so UnlockPanel can mount its web component
export function Providers({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    initApp({
      storage: { getStorageCallback: () => sessionStorage },
      dAppConfig: {
        nativeAuth: true,
        environment: EnvironmentsEnum.devnet,
        network,
        theme: ThemesEnum.dark,
        providers: {
          walletConnect: {
            walletConnectV2ProjectId
          }
        }
      }
    })
      .then(() => {
        console.log('MultiversX dapp initialized');
        setInitialized(true);
      })
      .catch((err) => {
        console.error('Failed to init MultiversX dapp config', err);
        // Still show the app even if init fails, to avoid blank screen
        setInitialized(true);
      });
  }, []);

  if (!initialized) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Initializing...
      </div>
    );
  }

  return (
    <BatchTransactionsContextProvider>
      {children}
    </BatchTransactionsContextProvider>
  );
}
