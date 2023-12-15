import { Message } from '@/types/chat';
import endent from 'endent';

export const isSubfinderCommand = (message: string) => {
  if (!message.startsWith('/')) return false;

  const trimmedMessage = message.trim();
  const commandPattern = /^\/subfinder(?:\s+(-[a-z]+|\S+))*$/;

  return commandPattern.test(trimmedMessage);
};

const displayHelpGuide = () => {
  return `
  [Subfinder](https://github.com/projectdiscovery/subfinder) is a powerful subdomain discovery tool designed to enumerate and uncover valid subdomains of websites efficiently through passive online sources. 

    Usage:
       /subfinder [flags]
  
    Flags:
    INPUT:
       -d, -domain string[]   domains to find subdomains for
  
    FILTER:
       -m, -match string[]    subdomain or list of subdomain to match (comma separated)
       -f, -filter string[]   subdomain or list of subdomain to filter (comma separated)

    OUTPUT:
       -oJ, -json              write output in JSONL(ines) format
       -cs, -collect-sources   include all sources in the output
       -v, -verbose            use AI to provide key observations, insights, recommended Actions about identified subdomains`;
};

interface SubfinderParams {
  domain: string[];
  match: string[];
  filter: string[];
  includeSources: boolean;
  outputJson: boolean;
  outputVerbose: boolean;
  error: string | null;
}

const MAX_INPUT_LENGTH = 1000;
const MAX_PARAMETER_COUNT = 5;

const parseCommandLine = (input: string) => {
  if (input.length > MAX_INPUT_LENGTH) {
    return { error: 'Input command is too long' } as SubfinderParams;
  }

  const args = input.split(' ');
  if (args.length > MAX_PARAMETER_COUNT) {
    return { error: 'Too many parameters provided' } as SubfinderParams;
  }

  const params: SubfinderParams = {
    domain: [],
    match: [],
    filter: [],
    includeSources: false,
    outputJson: false,
    outputVerbose: false,
    error: null,
  };

  const maxDomainLength = 50;
  const maxSubdomainLength = 255;

  const isValidDomain = (domain: string) =>
    /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
  const isValidSubdomain = (subdomain: string) =>
    /^[a-zA-Z0-9.-]+$/.test(subdomain);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-d':
      case '-domain':
        while (args[i + 1] && !args[i + 1].startsWith('-')) {
          const domain = args[++i];
          if (isValidDomain(domain) && domain.length <= maxDomainLength) {
            params.domain.push(domain);
          } else {
            params.error = `🚨 Invalid or too long domain provided (max ${maxDomainLength} characters)`;
            return params;
          }
        }
        break;
      case '-m':
      case '-match':
        while (args[i + 1] && !args[i + 1].startsWith('-')) {
          const match = args[++i];
          if (isValidSubdomain(match) && match.length <= maxSubdomainLength) {
            params.match.push(match);
          } else {
            params.error = `🚨 Invalid or too long match pattern provided (max ${maxSubdomainLength} characters)`;
            return params;
          }
        }
        break;
      case '-f':
      case '-filter':
        while (args[i + 1] && !args[i + 1].startsWith('-')) {
          const filter = args[++i];
          if (isValidSubdomain(filter) && filter.length <= maxSubdomainLength) {
            params.filter.push(filter);
          } else {
            params.error = `🚨 Invalid or too long filter pattern provided (max ${maxSubdomainLength} characters)`;
            return params;
          }
        }
        break;
      case '-cs':
      case '-collect-sources':
        params.includeSources = true;
        break;
      case '-oJ':
      case '-json':
        params.outputJson = true;
        break;
      case '-v':
      case '-verbose':
        params.outputVerbose = true;
        break;
    }
  }

  if (!params.domain.length) {
    params.error = '🚨 Error: -d parameter is required.';
  }

  return params;
};

export async function handleSubfinderRequest(
  lastMessage: Message,
  corsHeaders: HeadersInit | undefined,
  enableSubfinderFeature: boolean,
  OpenAIStream: {
    (model: string, messages: Message[], answerMessage: Message): Promise<
      ReadableStream<any>
    >;
    (arg0: any, arg1: any, arg2: any): any;
  },
  model: string,
  messagesToSend: Message[],
  answerMessage: Message
) {
  if (!enableSubfinderFeature) {
    return new Response('The Subfinder is disabled.', {
      status: 200,
      headers: corsHeaders,
    });
  }

  const parts = lastMessage.content.split(' ');
  if (parts.includes('-h')) {
    return new Response(displayHelpGuide(), {
      status: 200,
      headers: corsHeaders,
    });
  }

  const params = parseCommandLine(lastMessage.content);

  if (params.error) {
    return new Response(params.error, { status: 200, headers: corsHeaders });
  }

  let subfinderUrl = `${process.env.SECRET_GKE_PLUGINS_BASE_URL}/api/chat/plugins/subfinder?`;

  subfinderUrl += params.domain.map((d) => `domain=${d}`).join('&');
  if (params.match && params.match.length > 0) {
    subfinderUrl += '&' + params.match.map((m) => `match=${m}`).join('&');
  }
  if (params.filter && params.filter.length > 0) {
    subfinderUrl += '&' + params.filter.map((f) => `filter=${f}`).join('&');
  }
  if (params.includeSources) {
    subfinderUrl += `&includeSources=true`;
  }

  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Connection', 'keep-alive');

  const stream = new ReadableStream({
    async start(controller) {
      const sendMessage = (
        data: string,
        addExtraLineBreaks: boolean = false
      ) => {
        const formattedData = addExtraLineBreaks ? `${data}\n\n` : data;
        controller.enqueue(new TextEncoder().encode(formattedData));
      };

      sendMessage('🚀 Starting the scan. It might take a minute.', true);

      const intervalId = setInterval(() => {
        sendMessage('⏳ Still working on it, please hold on...', true);
      }, 10000);

      try {
        const subfinderResponse = await fetch(subfinderUrl, {
          method: 'GET',
          headers: {
            Authorization: `${process.env.SECRET_AUTH_PLUGINS}`,
            Host: 'plugins.hackergpt.co',
          },
        });

        let subfinderData = await subfinderResponse.text();

        subfinderData = processSubfinderData(subfinderData);

        if (subfinderData.length === 0) {
          const noDataMessage = `🔍 Didn't find any subdomains for "${params.domain.join(
            ', '
          )}"`;
          clearInterval(intervalId);
          sendMessage(noDataMessage, true);
          controller.close();
          return new Response(noDataMessage, {
            status: 200,
            headers: corsHeaders,
          });
        }

        clearInterval(intervalId);
        sendMessage('✅ Scan done! Now processing the results...', true);

        if (params.outputJson) {
          const responseString = createResponseString(
            params.domain,
            subfinderData
          );
          sendMessage(responseString, true);
          controller.close();
          return new Response(subfinderData, {
            status: 200,
            headers: corsHeaders,
          });
        }

        if (params.includeSources) {
          const responseString = createResponseString(
            params.domain,
            extractHostsAndSourcesFromData(subfinderData)
          );
          sendMessage(responseString, true);
          controller.close();
          return new Response(subfinderData, {
            status: 200,
            headers: corsHeaders,
          });
        }

        const responseString = createResponseString(
          params.domain,
          extractHostsFromSubfinderData(subfinderData)
        );
        sendMessage(responseString, true);

        if (params.outputVerbose) {
          const answerPrompt = createAnswerPromptSubfinder(
            params.domain.join(', '),
            extractHostsFromSubfinderData(subfinderData)
          );
          answerMessage.content = answerPrompt;

          const openAIResponseStream = await OpenAIStream(
            model,
            messagesToSend,
            answerMessage
          );
          const reader = openAIResponseStream.getReader();

          // @ts-expect-error
          reader.read().then(function processText({ done, value }) {
            if (done) {
              controller.close();
              return;
            }

            const decodedValue = new TextDecoder().decode(value, {
              stream: true,
            });
            sendMessage(decodedValue);

            return reader.read().then(processText);
          });
        } else {
          controller.close();
        }
      } catch (error) {
        clearInterval(intervalId);
        let errorMessage =
          '🚨 There was a problem during the scan. Please try again.';
        if (error instanceof Error) {
          errorMessage = `🚨 Error: ${error.message}`;
        }
        sendMessage(errorMessage, true);
        controller.close();
        return new Response(errorMessage, {
          status: 200,
          headers: corsHeaders,
        });
      }
    },
  });

  return new Response(stream, { headers });
}

const processSubfinderData = (data: string) => {
  return data
    .split('\n')
    .filter((line) => line && !line.startsWith('data:') && line.trim() !== '')
    .join('');
};

const extractHostsFromSubfinderData = (data: string) => {
  try {
    const validJsonString = '[' + data.replace(/}{/g, '},{') + ']';

    const jsonData = JSON.parse(validJsonString);

    return jsonData
      .map((item: { host: any }) => item.host)
      .filter((host: undefined) => host !== undefined)
      .join('\n');
  } catch (error) {
    console.error('Error processing data:', error);
    return '';
  }
};

const extractHostsAndSourcesFromData = (data: string) => {
  try {
    const validJsonString = '[' + data.replace(/}{/g, '},{') + ']';

    const jsonData = JSON.parse(validJsonString);

    return jsonData
      .map((item: { host: any; sources: any[] }) => {
        const host = item.host;
        const sources = item.sources ? `[${item.sources.join(', ')}]` : '[]';
        return `${host},${sources}`;
      })
      .join('\n');
  } catch (error) {
    console.error('Error processing data:', error);
    return '';
  }
};

const createResponseString = (
  domain: string | string[],
  subfinderData: string
) => {
  const date = new Date();
  const timezone = 'UTC-5';
  const formattedDateTime = date.toLocaleString('en-US', {
    timeZone: 'Etc/GMT+5',
    timeZoneName: 'short',
  });

  return (
    '## [Subfinder](https://github.com/projectdiscovery/subfinder) Scan Results\n' +
    '**Target**: "' +
    domain +
    '"\n\n' +
    '**Scan Date and Time**: ' +
    `${formattedDateTime} (${timezone}) \n\n` +
    '### Identified Domains:\n' +
    '```\n' +
    subfinderData +
    '\n' +
    '```\n'
  );
};

const createAnswerPromptSubfinder = (domain: string, subfinderData: string) => {
  if (subfinderData.length > 10000) {
    subfinderData = subfinderData.slice(0, 10000);
  }

  const structuredData = `
  Domain: ${domain}
  Identified Subdomains: 
  ${subfinderData}
  `;

  const messageContent = endent`
  Generate a comprehensive report for the Subfinder scan conducted on the domain "${domain}". The report should highlight key findings and insights for easy interpretation. Assume that the Subfinder tool has already completed the scan and provided detailed data on subdomains.
  
  Instructions:
  1. **Highlight Key Observations**: Analyze the subdomains for any notable characteristics or security implications. Focus on aspects like unusual subdomain patterns, potential security risks, or subdomains that may need immediate attention.
  2. **Provide Insightful Analysis**: Offer insights based on the subdomains' structure, naming conventions, and other relevant details derived from the scan.
  3. **Recommend Next Steps**: Outline strategic methods for probing identified subdomains for weaknesses and suggest tools or techniques for deeper assessment.
  
  Report Template:

  ### Key Observations and Insights
  - [Insights and notable observations about the subdomains]

  ### Recommended Actions
  - [Propose methods and tools for investigating the identified subdomains further]

  --- Subfinder Data for Analysis ---
  ${structuredData}`;

  return messageContent;
};
