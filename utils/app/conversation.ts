import { Conversation } from '@/types/chat';

export const updateConversation = (
  updatedConversation: Conversation,
  allConversations: Conversation[]
) => {
  const updatedConversations = allConversations.map((c) => {
    if (c.id === updatedConversation.id) {
      return updatedConversation;
    }

    return c;
  });

  saveConversation(updatedConversation);
  saveConversations(updatedConversations);

  return {
    single: updatedConversation,
    all: updatedConversations,
  };
};

export const saveConversation = (conversation: Conversation) => {
  try {
    localStorage.setItem('selectedConversation', JSON.stringify(conversation));
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.code === 22 || e.name === 'QuotaExceededError')
    ) {
      // Quota exceeded error indicates that localStorage is full
      console.error(
        'LocalStorage quota exceeded. Clearing selected conversation...'
      );
      // Remove only the selected conversation from localStorage
      localStorage.removeItem('selectedConversation');
      // You may also want to inform the user or handle the situation differently
    } else {
      // If it's not a quota error, rethrow it
      throw e;
    }
  }
};
export const saveConversations = (conversations: Conversation[]) => {
  try {
    // Try to save conversations to localStorage
    localStorage.setItem('conversationHistory', JSON.stringify(conversations));
  } catch (e) {
    if (
      e instanceof DOMException &&
      (e.code === 22 || e.name === 'QuotaExceededError')
    ) {
      // Quota exceeded error indicates that localStorage is full
      console.error(
        'LocalStorage quota exceeded. Clearing conversation history...'
      );
      // Remove only the conversations from localStorage
      localStorage.removeItem('conversationHistory');
      // Consider implementing a strategy to keep the most recent or important conversations
      // Optionally, try to save again or handle the situation differently
    } else {
      // If it's not a quota error, rethrow it
      throw e;
    }
  }
};
