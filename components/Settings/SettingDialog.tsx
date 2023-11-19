import { IconX, IconSettings, IconKey, IconTrash } from '@tabler/icons-react';
import {
  FC,
  SetStateAction,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useTranslation } from 'next-i18next';

import { useCreateReducer } from '@/hooks/useCreateReducer';

import { getSettings, saveSettings } from '@/utils/app/settings';

import { Settings } from '@/types/settings';

import HomeContext from '@/pages/api/home/home.context';

import { getAuth } from 'firebase/auth';
import { initFirebaseApp } from '@/utils/server/firebase-client-init';

import { getPremiumStatus } from '@/components/Payments/getPremiumStatus';
import { getPortalUrl } from '@/components/Payments/stripePayments';

import { useLogOut } from '@/components/Authorization/LogOutButton';
import { useRouter } from 'next/navigation';

import firebase from '@/utils/server/firebase-client-init';

import { ApiKey } from '@/types/api';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SettingDialog: FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation('settings');
  const settings: Settings = getSettings();
  const { state, dispatch } = useCreateReducer<Settings>({
    initialState: settings,
  });
  const { dispatch: homeDispatch } = useContext(HomeContext);
  const modalRef = useRef<HTMLDivElement>(null);
  const { isUserLoggedIn, handleLogOut } = useLogOut();
  const router = useRouter();
  const [isPremium, setIsPremium] = useState(false);
  const [preFetchedPortalUrl, setPreFetchedPortalUrl] = useState<string | null>(
    null
  );
  const app = initFirebaseApp();
  const auth = getAuth(app);

  const tabs = [
    {
      name: 'General',
      icon: <IconSettings size={22} strokeWidth={2} />,
      isProtected: false,
    },
    {
      name: 'API keys',
      icon: <IconKey size={22} strokeWidth={2} />,
      isProtected: true,
    },
  ];

  const [selectedTab, setSelectedTab] = useState(tabs[0].name);

  const [showTokenPopup, setShowTokenPopup] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [keyName, setKeyName] = useState('');
  const [keyCreated, setKeyCreated] = useState(false);
  const [userApiKeys, setUserApiKeys] = useState<ApiKey[]>([]);

  const handleCreateNewKey = async () => {
    const db = firebase.firestore(app);

    try {
      if (auth && auth.currentUser) {
        const userEmail = auth.currentUser.email;
        const userId = auth.currentUser.uid;

        const currentKeys = await db
          .collection('apiKeys')
          .where('userId', '==', userId)
          .get();

        if (currentKeys.size >= 10) {
          alert('You have reached the maximum limit of 10 API keys.');
          return;
        }

        const generatedToken = `sk-${uuidv4()}`;
        const censoredKey = `${generatedToken.substring(
          0,
          2
        )}-...${generatedToken.substring(generatedToken.length - 4)}`;

        setNewToken(generatedToken);
        setShowTokenPopup(true);
        setKeyCreated(true);

        const newKeyData = {
          keyName: keyName,
          key: generatedToken,
          censoredKey: censoredKey,
          userId: auth.currentUser.uid,
          userEmail: userEmail,
          created: new Date(),
          lastUsed: null,
        };

        db.collection('apiKeys')
          .add(newKeyData)
          .then((docRef) => {
            const tempTimestamp = firebase.firestore.Timestamp.fromDate(
              new Date()
            );

            setUserApiKeys((prevKeys) => [
              ...prevKeys,
              { ...newKeyData, id: docRef.id, created: tempTimestamp },
            ]);
          })
          .catch((e) => {
            console.error('Error adding document: ', e);
          });
      } else {
        console.error('Auth service not initialized or no user is logged in');
      }
    } catch (e) {
      console.error('Error adding document: ', e);
    }
  };

  const handleDeleteKey = async (keyId: string | undefined) => {
    const db = firebase.firestore(app);

    try {
      await db.collection('apiKeys').doc(keyId).delete();
      setUserApiKeys((prevKeys) => prevKeys.filter((key) => key.id !== keyId));
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  const fetchUserApiKeys = async () => {
    const auth = firebase.auth();
    const db = firebase.firestore(app);

    let keys: ApiKey[] = [];

    if (auth.currentUser) {
      const userId = auth.currentUser.uid;
      try {
        const querySnapshot = await db
          .collection('apiKeys')
          .where('userId', '==', userId)
          .get();

        querySnapshot.forEach((doc: { id: any; data: () => any }) => {
          keys.push({ id: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.error('Error fetching user API keys:', error);
      }
    }
    return keys;
  };

  useEffect(() => {
    const fetchKeysIfPremium = async () => {
      if (selectedTab === 'API keys' && isPremium) {
        const keys = await fetchUserApiKeys();
        setUserApiKeys(keys);
      }
    };

    fetchKeysIfPremium();
  }, [selectedTab, isPremium]);

  const resetPopupState = () => {
    setShowTokenPopup(false);
    setKeyCreated(false);
    setKeyName('');
  };

  const checkPremiumAndPortal = async () => {
    const newPremiumStatus = auth.currentUser
      ? await getPremiumStatus(app)
      : false;
    setIsPremium(newPremiumStatus);
    if (newPremiumStatus && isUserLoggedIn) {
      try {
        const portalUrl = await getPortalUrl(app);
        setPreFetchedPortalUrl(portalUrl);
      } catch (error) {
        console.error('Error pre-fetching portal URL:', error);
      }
    }
  };

  useEffect(() => {
    checkPremiumAndPortal();
  }, [app, auth.currentUser?.uid, isUserLoggedIn]);

  const manageSubscription = () => {
    if (preFetchedPortalUrl) {
      router.push(preFetchedPortalUrl);
    } else {
      (async () => {
        try {
          const portalUrl = await getPortalUrl(app);
          router.push(portalUrl);
        } catch (error) {
          console.error('Error fetching portal URL:', error);
        }
      })();
    }
  };

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        window.addEventListener('mouseup', handleMouseUp);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      window.removeEventListener('mouseup', handleMouseUp);
      onClose();
    };

    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  useEffect(() => {
    homeDispatch({ field: 'lightMode', value: state.theme });
    saveSettings(state);
  }, [state.theme]);

  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [apiKeyToRevoke, setApiKeyToRevoke] = useState('');
  const [apicensoredKeyToRevoke, setcensoredKeyApiKeyToRevoke] = useState('');

  const handleRevokeClick = (
    apiKey: SetStateAction<string>,
    censoredKey: string
  ) => {
    setApiKeyToRevoke(apiKey);
    setcensoredKeyApiKeyToRevoke(censoredKey);
    setShowRevokeModal(true);
  };

  const handleRevokeConfirm = async () => {
    if (apiKeyToRevoke) {
      await handleDeleteKey(apiKeyToRevoke);
      setShowRevokeModal(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="inset-negative-5 fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="fixed inset-0 z-10 overflow-hidden">
        <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div
            className="hidden sm:inline-block sm:h-screen sm:align-middle"
            aria-hidden="true"
          />
          {/* Modal dialog container */}
          <div
            ref={modalRef}
            className="inline-block max-h-[500px] max-h-[80%] w-11/12 transform overflow-y-auto rounded-lg border border-gray-300 bg-white pt-5 pb-4 text-left align-bottom shadow-xl transition-all dark:border-neutral-400 dark:bg-hgpt-dark-gray sm:my-8 sm:max-h-[600px] sm:w-full sm:max-w-3xl sm:p-2 sm:align-middle"
            role="dialog"
          >
            {/* Close button */}
            <div className="px-4 pt-5 text-black dark:text-neutral-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{t('Settings')}</h3>
                <button onClick={onClose}>
                  <IconX color="gray" size={22} strokeWidth={2} />
                </button>
              </div>
              <hr className="my-4 border-hgpt-chat-gray dark:border-white" />
            </div>

            {/* Tabbed Layout */}
            <div className="flex flex-col sm:flex-col">
              {/* Sidebar with tabs */}
              <div>
                <nav
                  className="flex justify-start justify-center"
                  aria-label="Sidebar"
                >
                  {tabs.map((tab) => {
                    // Only show the tab if it is not protected, or if it is protected and the user is a premium, logged-in user
                    if (
                      !tab.isProtected ||
                      (tab.isProtected && isUserLoggedIn)
                    ) {
                      return (
                        <button
                          key={tab.name}
                          onClick={() => setSelectedTab(tab.name)}
                          className={`mb-2 mr-2 inline-flex items-center justify-center rounded-md py-2 px-4 text-sm font-medium sm:mb-2 sm:mr-0 sm:justify-start ${
                            selectedTab === tab.name
                              ? 'bg-hgpt-hover-white text-black dark:bg-hgpt-chat-gray dark:text-neutral-200'
                              : 'text-black hover:bg-gray-100 dark:text-neutral-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          {tab.icon}
                          <span className="ml-2">{tab.name}</span>
                        </button>
                      );
                    }
                    return null;
                  })}
                </nav>
              </div>

              {/* Content for the selected tab */}
              <div className="w-full p-6">
                {selectedTab === 'General' && (
                  <div>
                    <div className="mb-2 text-sm font-bold text-black dark:text-neutral-200">
                      {t('Theme')}
                    </div>

                    <select
                      className="w-full cursor-pointer bg-transparent p-2 text-neutral-700 dark:text-neutral-200"
                      value={state.theme}
                      onChange={(event) =>
                        dispatch({ field: 'theme', value: event.target.value })
                      }
                    >
                      <option value="dark">{t('Dark mode')}</option>
                      <option value="light">{t('Light mode')}</option>
                    </select>
                    {isPremium && isUserLoggedIn && (
                      <button
                        type="button"
                        className="mt-6 w-full rounded-lg border border border-gray-300 bg-white px-4 py-2 text-black shadow hover:bg-hgpt-hover-white dark:bg-hgpt-dark-gray dark:text-white dark:hover:bg-hgpt-medium-gray"
                        onClick={manageSubscription}
                      >
                        <span>Manage Subscription</span>
                      </button>
                    )}
                    {isUserLoggedIn ? (
                      <>
                        <button
                          type="button"
                          className="mt-6 w-full rounded-lg border border-red-700 bg-red-600 px-4 py-2 text-white shadow hover:bg-red-500 focus:outline-none dark:border-neutral-800 dark:border-opacity-50 dark:bg-red-700 dark:text-white dark:hover:bg-red-500"
                          onClick={handleLogOut}
                        >
                          Log Out
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
                {selectedTab === 'API keys' && (
                  <div>
                    {isPremium && isUserLoggedIn ? (
                      <>
                        <div className="text-left">
                          <p className="mb-4 text-black dark:text-white">
                            Your secret API keys are listed below. Please note
                            that we do not display your secret API keys again
                            after you generate them.
                          </p>
                          <p className="mb-4 text-black dark:text-white">
                            Do not share your API key with others, or expose it
                            in the browser or other client-side code.
                          </p>
                          <p className="mb-4 text-black dark:text-white">
                            Check our{' '}
                            <a
                              href="https://hackergpt.gitbook.io/chat/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              API documentation
                            </a>{' '}
                            for guidance.
                          </p>
                        </div>
                        {isPremium &&
                          isUserLoggedIn &&
                          userApiKeys.length > 0 && (
                            <div className="mb-4 overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 text-center">
                                <thead className="bg-white dark:bg-hgpt-dark-gray">
                                  <tr>
                                    <th
                                      scope="col"
                                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white"
                                    >
                                      Name
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white"
                                    >
                                      Key
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white"
                                    >
                                      Created
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-black dark:text-white"
                                    >
                                      Last Used
                                    </th>
                                    <th
                                      scope="col"
                                      className="px-2 py-3 text-xs font-bold uppercase tracking-wider text-black dark:text-white"
                                    >
                                      {/* Empty for action buttons */}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white text-center dark:bg-hgpt-dark-gray">
                                  {userApiKeys.map((key, index) => (
                                    <tr key={index}>
                                      <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">
                                        {key.keyName.length > 15
                                          ? `${key.keyName.substring(0, 15)}...`
                                          : key.keyName}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">
                                        {key.censoredKey}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">
                                        {key.created
                                          ? key.created
                                              .toDate()
                                              .toLocaleDateString()
                                          : 'Never'}
                                      </td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-black dark:text-white">
                                        {key.lastUsed
                                          ? new Date(
                                              key.lastUsed.toDate()
                                            ).toLocaleDateString()
                                          : 'Never'}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium">
                                        <button
                                          onClick={() =>
                                            handleRevokeClick(
                                              key.id,
                                              key.censoredKey
                                            )
                                          }
                                          className="text-black hover:text-hgpt-chat-gray dark:text-white dark:hover:text-hgpt-hover-white"
                                        >
                                          <IconTrash
                                            size={18}
                                            strokeWidth={2}
                                          />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        <button
                          type="button"
                          className="mt-4 w-full rounded-lg bg-blue-500 px-4 py-2 text-white shadow hover:bg-blue-600 focus:outline-none"
                          onClick={() => setShowTokenPopup(true)}
                        >
                          Create New Secret Key
                        </button>
                      </>
                    ) : (
                      <div className="text-white">
                        To use the HackerGPT API with your app and create API
                        keys, you need to have a Plus Subscription.
                      </div>
                    )}
                  </div>
                )}
                {showTokenPopup && (
                  <div className="z-60 fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="m-4 mx-auto max-w-lg rounded bg-white p-6 shadow dark:bg-hgpt-dark-gray">
                      <div className="flex flex-col">
                        <div className="mb-4 flex w-full items-center justify-between">
                          <h2 className="text-lg font-bold text-black dark:text-white">
                            Create an API Key
                          </h2>
                          <button onClick={resetPopupState}>
                            <IconX color="gray" size={22} strokeWidth={2} />
                          </button>
                        </div>
                        {!keyCreated ? (
                          <>
                            <h2 className="mb-2 text-sm text-black dark:text-white">
                              Name your key
                            </h2>
                            <input
                              type="text"
                              placeholder="My Test Key"
                              value={keyName}
                              onChange={(e) => setKeyName(e.target.value)}
                              className="mt-2 w-full rounded bg-hgpt-light-gray p-2 text-white dark:bg-hgpt-medium-gray"
                            />
                            <button
                              className="mt-4 w-full rounded bg-blue-500 py-2 px-4 text-white"
                              onClick={handleCreateNewKey}
                              disabled={!keyName}
                            >
                              Create
                            </button>
                          </>
                        ) : (
                          <>
                            <h2 className="mb-2 self-start text-sm text-black dark:text-white">
                              Your new key:
                            </h2>{' '}
                            {/* Added self-start */}
                            <p className="mb-4 w-full rounded bg-hgpt-light-gray p-2 text-white dark:bg-hgpt-medium-gray">
                              {newToken}
                            </p>
                            <p className="mb-4 self-start text-sm text-black dark:text-white">
                              Please copy it now and write it down somewhere
                              safe. You will not be able to see it again.
                            </p>{' '}
                            {/* Added self-start */}
                            <button
                              className="w-full rounded bg-blue-500 py-2 px-4 text-white"
                              onClick={() => {
                                setShowTokenPopup(false);
                                setKeyCreated(false);
                              }}
                            >
                              Done
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {showRevokeModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="m-4 mx-auto max-w-sm rounded-lg bg-white p-6 dark:bg-hgpt-dark-gray">
                      <div className="flex flex-col">
                        <h3 className="mb-4 text-lg font-bold text-black dark:text-white">
                          Revoke secret key
                        </h3>
                        <p className="mb-4 text-sm text-black dark:text-white">
                          This API key will immediately be disabled. API
                          requests made using this key will be rejected, which
                          could cause any systems still depending on it to
                          break. Once revoked, you&apos;ll no longer be able to
                          view or modify this API key.
                        </p>
                        <div className="mb-4 w-full rounded bg-hgpt-light-gray p-2 text-white dark:bg-hgpt-medium-gray">
                          {apicensoredKeyToRevoke}
                        </div>
                        <div className="flex justify-end space-x-2">
                          <button
                            className="rounded bg-gray-300 py-2 px-4 text-black hover:bg-gray-400 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700"
                            onClick={() => setShowRevokeModal(false)}
                          >
                            Cancel
                          </button>
                          <button
                            className="rounded bg-red-600 py-2 px-4 text-white hover:bg-red-700"
                            onClick={handleRevokeConfirm}
                          >
                            Revoke key
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
