import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth'; // Import User type
import { initFirebaseApp } from '@/utils/server/firebase-client-init';
import { getPremiumStatus } from '@/components/Payments/getPremiumStatus';
import { getCheckoutUrl } from '@/components/Payments/stripePayments';

const usePremiumStatusAndCheckoutUrl = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const app = initFirebaseApp();
    const auth = getAuth(app);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const premiumStatus = await getPremiumStatus(app);
          setIsPremium(premiumStatus);
          const url = await getCheckoutUrl(app);
          setCheckoutUrl(url);
        } catch (error) {
          console.error('Error in usePremiumStatusAndCheckoutUrl:', error);
        }
      } else {
        setIsPremium(false);
        setCheckoutUrl(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, isPremium, checkoutUrl, loading };
};

export default usePremiumStatusAndCheckoutUrl;
