import { Message } from '@/types/chat';
import { OpenAIError } from '@/pages/api/openaistream';

import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import {
  ParsedEvent,
  ReconnectInterval,
  createParser,
} from 'eventsource-parser';

export const HackerGPTStream = async (
  messages: Message[],
  modelTemperature: number,
  maxTokens: number,
  enableStream: boolean
) => {
  const url = `https://api.openai.com/v1/chat/completions`;
  const headers = {
    Authorization: `Bearer ${process.env.SECRET_OPENAI_API_KEY}`,
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

  const queryPineconeVectorStore = async (question: string) => {
    const embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: process.env.SECRET_OPENAI_API_KEY,
    });

    const queryEmbedding = await embeddingsInstance.embedQuery(question);

    const PINECONE_QUERY_URL = `https://${process.env.SECRET_PINECONE_INDEX}-${process.env.SECRET_PINECONE_PROJECT_ID}.svc.${process.env.SECRET_PINECONE_ENVIRONMENT}.pinecone.io/query`;

    const requestBody = {
      topK: 5,
      vector: queryEmbedding,
      includeMetadata: true,
      namespace: `${process.env.SECRET_PINECONE_NAMESPACE}`,
    };

    try {
      const response = await fetch(PINECONE_QUERY_URL, {
        method: 'POST',
        headers: {
          'Api-Key': `${process.env.SECRET_PINECONE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const matches = data.matches || [];

      const minimumContextCount = 3;
      if (matches.length < minimumContextCount) {
        return 'None';
      }

      const filteredMatches = matches.filter(
        (match: { score: number }) => match.score > 0.83
      );

      if (filteredMatches.length > 0) {
        let formattedResults = filteredMatches
          .map((match: { metadata: { text: string } }, index: any) => {
            const contextText = match.metadata?.text || '';
            return `[CONTEXT ${index}]:\n${contextText}\n[END CONTEXT ${index}]\n\n`;
          })
          .join('');

        while (formattedResults.length > 7500) {
          let lastContextIndex = formattedResults.lastIndexOf('[CONTEXT ');
          if (lastContextIndex === -1) {
            break;
          }
          formattedResults = formattedResults
            .substring(0, lastContextIndex)
            .trim();
        }

        return formattedResults || 'None';
      } else {
        return 'None';
      }
    } catch (error) {
      console.error(`Error querying Pinecone: ${error}`);
      return 'None';
    }
  };

  const usePinecone = process.env.USE_PINECONE === 'TRUE';

  let systemMessage: Message = {
    role: 'system',
    content: `${process.env.SECRET_OPENAI_SYSTEM_PROMPT}`,
  };

  if (
    usePinecone &&
    cleanedMessages.length > 0 &&
    cleanedMessages[cleanedMessages.length - 1].role === 'user'
  ) {
    const combinedLastMessages =
      cleanedMessages[cleanedMessages.length - 1].content;
    const pineconeResults = await queryPineconeVectorStore(
      combinedLastMessages
    );

    if (pineconeResults !== 'None') {
      systemMessage.content =
        `${process.env.SECRET_OPENAI_SYSTEM_PROMPT} ` +
        `${process.env.SECRET_PINECONE_SYSTEM_PROMPT}` +
        `Context:\n ${pineconeResults}`;
    }
  }

  if (cleanedMessages[0]?.role !== 'system') {
    cleanedMessages.unshift(systemMessage);
  }

  const requestBody = {
    model: `${process.env.SECRET_HACKERGPT_MODEL}`,
    messages: cleanedMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    stream: enableStream,
    temperature: modelTemperature,
    max_tokens: maxTokens,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody),
  });

  if (res.status !== 200) {
    const result = await res.json();
    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code
      );
    } else {
      throw new Error(`OpenAI API returned an error: ${result.statusText}`);
    }
  }

  if (!enableStream) {
    const data = await res.json();
    const messages = data.choices.map(
      (choice: { message: { content: any } }) => choice.message.content
    );
    return messages.join('\n');
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const streamResult = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data;
          if (data !== '[DONE]') {
            try {
              const json = JSON.parse(data);
              if (json.choices[0].finish_reason != null) {
                controller.close();
                return;
              }
              const text = json.choices[0].delta.content;
              const queue = encoder.encode(text);
              controller.enqueue(queue);
            } catch (e) {
              controller.error(e);
            }
          }
        }
      };

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        const content = decoder.decode(chunk);
        if (content.trim() === 'data: [DONE]') {
          controller.close();
        } else {
          parser.feed(content);
        }
      }
    },
  });

  return streamResult;
};
