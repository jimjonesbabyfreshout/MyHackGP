import { Message } from '@/types/chat';

class APIError extends Error {
  code: any;
  constructor(message: string | undefined, code: any) {
    super(message);
    this.name = 'APIError';
    this.code = code;
  }
}

export const PalmStream = async (messages: Message[]) => {
  const url = `${process.env.SECRET_HACKERGPT_FIREBASE_FUNCTION_URL}`;
  const headers = {
    Authorization: `Bearer ${process.env.SECRET_HACKERGPT_API_KEY}`,
    'Content-Type': 'application/json',
  };

  let cleanedMessages = [];
  const usageCapMessage = "Hold On! You've Hit Your Usage Cap.";

  for (let i = 0; i < messages.length - 1; i++) {
    const message = messages[i];
    const nextMessage = messages[i + 1];

    if (
      !message ||
      !nextMessage ||
      typeof message.role === 'undefined' ||
      typeof nextMessage.role === 'undefined'
    ) {
      console.error(
        'One of the messages is undefined or does not have a role property'
      );
      continue;
    }

    if (
      nextMessage.role === 'assistant' &&
      nextMessage.content.includes(usageCapMessage)
    ) {
      if (message.role === 'user') {
        i++;
        continue;
      }
    } else if (nextMessage.role === 'user' && message.role === 'user') {
      continue;
    } else {
      cleanedMessages.push(message);
    }
  }

  if (
    messages[messages.length - 1].role === 'user' &&
    !messages[messages.length - 1].content.includes(usageCapMessage) &&
    (cleanedMessages.length === 0 ||
      cleanedMessages[cleanedMessages.length - 1].role !== 'user')
  ) {
    cleanedMessages.push(messages[messages.length - 1]);
  }

  if (
    cleanedMessages.length % 2 === 0 &&
    cleanedMessages[0]?.role === 'assistant'
  ) {
    cleanedMessages.shift();
  }

  try {
    const requestBody = {
      messages: cleanedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: 0.2,
      max_tokens: 1024,
      top_p: 0.8,
      top_k: 40,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const result = await res.json();
      let errorMessage = result.error?.message || 'An unknown error occurred';

      switch (res.status) {
        case 400:
          throw new APIError(`Bad Request: ${errorMessage}`, 400);
        case 401:
          throw new APIError(`Invalid Credentials: ${errorMessage}`, 401);
        case 402:
          throw new APIError(`Out of Credits: ${errorMessage}`, 402);
        case 403:
          throw new APIError(`Moderation Required: ${errorMessage}`, 403);
        case 408:
          throw new APIError(`Request Timeout: ${errorMessage}`, 408);
        case 429:
          throw new APIError(`Rate Limited: ${errorMessage}`, 429);
        case 502:
          throw new APIError(`Service Unavailable: ${errorMessage}`, 502);
        default:
          throw new APIError(`HTTP Error: ${errorMessage}`, res.status);
      }
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const responseData = await res.json();
    if (!responseData.predictions || 
        !Array.isArray(responseData.predictions) ||
        !responseData.predictions[0].candidates ||
        !responseData.predictions[0].candidates[0].content) {
      throw new Error("Unexpected response data structure from Google API");
    }
    return responseData.predictions[0].candidates[0].content;
  } catch (error) {
    if (error instanceof APIError) {
      console.error(
        `API Error - Code: ${error.code}, Message: ${error.message}`
      );
    } else if (error instanceof Error) {
      console.error(`Unexpected Error: ${error.message}`);
    } else {
      console.error(`An unknown error occurred: ${error}`);
    }
  }
};
