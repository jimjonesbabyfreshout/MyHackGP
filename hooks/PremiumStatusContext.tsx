// PremiumStatusContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import usePremiumStatusAndCheckoutUrl from '@/hooks/useUserStatusAndCheckout';
import { User } from 'firebase/auth';

type PremiumStatusContextType = {
  user: User | null;
  isPremium: boolean;
  checkoutUrl: string | null;
  loading: boolean;
};

const PremiumStatusContext = createContext<
  PremiumStatusContextType | undefined
>(undefined);

interface PremiumStatusProviderProps {
  children: ReactNode;
}

export const PremiumStatusProvider: React.FC<PremiumStatusProviderProps> = ({
  children,
}) => {
  const contextValue = usePremiumStatusAndCheckoutUrl();

  return (
    <PremiumStatusContext.Provider value={contextValue}>
      {children}
    </PremiumStatusContext.Provider>
  );
};

export const usePremiumStatusContext = () => {
  const context = useContext(PremiumStatusContext);
  if (context === undefined) {
    throw new Error(
      'usePremiumStatusContext must be used within a PremiumStatusProvider',
    );
  }
  return context;
};
