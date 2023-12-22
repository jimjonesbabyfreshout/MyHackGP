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

    CONFIGURATION:
       -nW, -active   display active subdomains only
       -timeout int   seconds to wait before timing out (default 30)

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
  timeout: number;
  match: string[];
  filter: string[];
  onlyActive: boolean;
  includeSources: boolean;
  outputJson: boolean;
  outputVerbose: boolean;
  error: string | null;
}

const parseCommandLine = (input: string) => {
  const MAX_INPUT_LENGTH = 1000;
  const maxDomainLength = 255;
  const maxSubdomainLength = 255;

  if (input.length > MAX_INPUT_LENGTH) {
    return { error: 'Input command is too long' } as SubfinderParams;
  }

  const args = input.split(' ');

  const params: SubfinderParams = {
    domain: [],
    timeout: 30,
    match: [],
    filter: [],
    onlyActive: false,
    includeSources: false,
    outputJson: false,
    outputVerbose: false,
    error: null,
  };

  const isInteger = (value: string) => /^[0-9]+$/.test(value);
  const isValidDomain = (domain: string) =>
    /^[a-zA-Z0-9.-]+$/.test(domain) && domain.length <= maxDomainLength;
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
      case '-timeout':
        if (args[i + 1] && isInteger(args[i + 1])) {
          let timeoutValue = parseInt(args[++i]);
          if (timeoutValue > 300) {
            params.error = `🚨 Timeout value exceeds the maximum limit of 90 seconds`;
            return params;
          }
          params.timeout = timeoutValue;
        } else {
          params.error = `🚨 Invalid timeout value for '${args[i]}' flag`;
          return params;
        }
        break;
      case '-nW':
      case '-active':
        params.onlyActive = true;
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

  if (!params.domain.length || params.domain.length === 0) {
    params.error = '🚨 -d parameter is required.';
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
  answerMessage: Message,
  invokedByToolId: boolean
) {
  if (!enableSubfinderFeature) {
    return new Response('The Subfinder is disabled.', {
      status: 200,
      headers: corsHeaders,
    });
  }

  let aiResponse = '';

  if (invokedByToolId) {
    const answerPrompt = transformUserQueryToSubfinderCommand(lastMessage);
    answerMessage.content = answerPrompt;

    const openAIResponseStream = await OpenAIStream(
      model,
      messagesToSend,
      answerMessage
    );

    const reader = openAIResponseStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      aiResponse += new TextDecoder().decode(value, { stream: true });
    }

    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const jsonResponse = JSON.parse(jsonMatch[0]);
        lastMessage.content = jsonResponse.command;
      } else {
        return new Response(
          `${aiResponse}\n\nNo JSON command found in the AI response.`,
          {
            status: 200,
            headers: corsHeaders,
          }
        );
      }
    } catch (error) {
      return new Response(
        `${aiResponse}\n\n'Error extracting and parsing JSON from AI response: ${error}`,
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }
  }

  const parts = lastMessage.content.split(' ');
  if (parts.includes('-h')) {
    return new Response(displayHelpGuide(), {
      status: 200,
      headers: corsHeaders,
    });
  }

  const params = parseCommandLine(lastMessage.content);

  if (params.error && invokedByToolId) {
    return new Response(`${aiResponse}\n\n${params.error}`, {
      status: 200,
      headers: corsHeaders,
    });
  } else if (params.error) {
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
  if (params.onlyActive) {
    subfinderUrl += `&onlyActive=true`;
  }
  if (params.includeSources) {
    subfinderUrl += `&includeSources=true`;
  }
  if (params.timeout !== 30) {
    subfinderUrl += `&timeout=${params.timeout}`;
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

      if (invokedByToolId) {
        sendMessage(aiResponse, true);
      }

      sendMessage('🚀 Starting the scan. It might take a minute.', true);

      const intervalId = setInterval(() => {
        sendMessage('⏳ Still working on it, please hold on...', true);
      }, 15000);

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

const transformUserQueryToSubfinderCommand = (lastMessage: Message) => {
  const answerMessage = endent`
  Query: "${lastMessage.content}"

  Based on this query, generate a command for the 'subfinder' tool, focusing on subdomain discovery. The command should use only the most relevant flags, with '-domain' being essential. The '-json' flag is optional and should be included only if specified in the user's request.

  Command Construction Guidelines:
  1. **Selective Flag Use**: Carefully select flags that are directly pertinent to the task. The available flags are:
  -domain string[]: Identifies the target domain(s) for subdomain discovery. (required)
  -active: Includes only active subdomains if necessary. (optional)
  -timeout int: Sets a timeout limit (default is 30 seconds). (optional)
  -match string[]: Matches specific subdomains, listed in a comma-separated format. (optional)
  -filter string[]: Excludes certain subdomains, also in a comma-separated format. (optional)
  -json: Outputs results in a structured JSON format. (optional)
  -collect-sources: Gathers source information for each subdomain. (optional)
  -verbose: Provides an in-depth analysis if detailed insights are needed. (optional)
  Use these flags judiciously to align with the specific requirements of the request. (optional)
  2. **Relevance and Efficiency**: Ensure that the flags chosen for the command are relevant and contribute to an effective and efficient subdomain discovery process.

  Response:
  Based on the query, the appropriate Subfinder command is:
  ALWAYS USE THIS FORMAT BELOW:
  \`\`\`json
  {
    "command": "/subfinder -domain [domain] [additional flags as needed]"
  }
  \`\`\`
  Replace '[domain]' with the actual domain name. Include any of the additional flags only if they align with the specifics of the request.

  For example, for a request like 'find subdomains for example.com', the command could be:
  \`\`\`json
  {
    "command": "/subfinder -d example.com"
  }
  \`\`\``;

  return answerMessage;
};

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
