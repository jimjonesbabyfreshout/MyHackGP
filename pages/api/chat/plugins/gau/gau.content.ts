import { Message } from '@/types/chat';

export const isGauCommand = (message: string) => {
  if (!message.startsWith('/')) return false;

  const trimmedMessage = message.trim();
  const commandPattern = /^\/gau(?:\s+(-[a-z]+|\S+))*$/;

  return commandPattern.test(trimmedMessage);
};

const displayHelpGuide = () => {
  return `
  [Gau](https://github.com/lc/gau) is a powerful web scraping tool that fetches known URLs from multiple sources, including AlienVault&apos;s Open Threat Exchange, the Wayback Machine, and Common Crawl. 

    Usage:
       /gau [target] [flags]

    Flags:
    CONFIGURATION:
       --from string         fetch URLs from date (format: YYYYMM)
       --to string           fetch URLs to date (format: YYYYMM)
       --providers strings   list of providers to use (wayback, commoncrawl, otx, urlscan)

    FILTER:
       --blacklist strings   list of extensions to skip
       --fc strings          list of status codes to filter
       --ft strings          list of mime-types to filter
       --mc strings          list of status codes to match
       --mt strings          list of mime-types to match
       --fp                  remove different parameters of the same endpoint`;
};

interface GauParams {
  target: string;
  blacklist: string[];
  fc: number[];
  fromDate: string;
  ft: string[];
  fp: boolean;
  json: boolean;
  mc: number[];
  mt: string[];
  providers: string[];
  includeSubdomains: boolean;
  toDate: string;
  verbose: boolean;
  error: string | null;
}

const parseGauCommandLine = (input: string): GauParams => {
  const MAX_INPUT_LENGTH = 2000;
  const MAX_PARAM_LENGTH = 100;
  const MAX_PARAMETER_COUNT = 15;
  const MAX_ARRAY_SIZE = 50;

  const params: GauParams = {
    target: '',
    blacklist: [],
    fc: [],
    fromDate: '',
    ft: [],
    fp: false,
    json: false,
    mc: [],
    mt: [],
    providers: [],
    includeSubdomains: false,
    toDate: '',
    verbose: false,
    error: null,
  };

  if (input.length > MAX_INPUT_LENGTH) {
    params.error = `🚨 Input command is too long`;
    return params;
  }

  const args = input.split(' ');
  args.shift();
  if (args.length > MAX_PARAMETER_COUNT) {
    params.error = `🚨 Too many parameters provided`;
    return params;
  }

  // const isInteger = (value: string) => /^[0-9]+$/.test(value);
  const isWithinLength = (value: string) => value.length <= MAX_PARAM_LENGTH;
  const isDateFormat = (value: string) => /^\d{6}$/.test(value);
  const isValidDomainOrUrl = (url: string) =>
    /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(url);

  let domainOrUrlFound = false;

  for (let i = 0; i < args.length; i++) {
    if (!isWithinLength(args[i])) {
      params.error = `🚨 Parameter value too long: ${args[i]}`;
      return params;
    }

    if (!args[i].startsWith('--')) {
      if (isValidDomainOrUrl(args[i]) && !domainOrUrlFound) {
        params.target = args[i];
        domainOrUrlFound = true;
        continue;
      } else if (!domainOrUrlFound) {
        params.error = `🚨 Invalid domain or URL: ${args[i]}`;
        return params;
      }
    }

    try {
      switch (args[i]) {
        case '--blacklist':
          params.blacklist = args[++i].split(',');
          if (params.blacklist.length > MAX_ARRAY_SIZE) {
            params.error = `🚨 Too many elements in blacklist array`;
            return params;
          }
          break;
        case '--fc':
          params.fc = args[++i].split(',').map(Number);
          if (params.fc.some(isNaN) || params.fc.length > MAX_ARRAY_SIZE) {
            params.error = `🚨 Invalid filter codes or too many elements`;
            return params;
          }
          break;
        case '--from':
          params.fromDate = args[++i];
          if (!isDateFormat(params.fromDate)) {
            params.error = `🚨 Invalid date format for '--from' flag`;
            return params;
          }
          break;
        case '--ft':
          params.ft = args[++i].split(',');
          if (params.ft.length > MAX_ARRAY_SIZE) {
            params.error = `🚨 Too many MIME types in filter`;
            return params;
          }
          break;
        case '--fp':
          params.fp = true;
          break;
        case '--mc':
          params.mc = args[++i].split(',').map(Number);
          if (params.mc.some(isNaN) || params.mc.length > MAX_ARRAY_SIZE) {
            params.error = `🚨 Invalid match codes or too many elements`;
            return params;
          }
          break;
        case '--mt':
          params.mt = args[++i].split(',');
          if (params.mt.length > MAX_ARRAY_SIZE) {
            params.error = `🚨 Too many MIME types in match`;
            return params;
          }
          break;
        case '--providers':
          params.providers = args[++i].split(',');
          if (params.providers.length > MAX_ARRAY_SIZE) {
            params.error = `🚨 Too many elements in providers array`;
            return params;
          }
          break;
        case '--to':
          params.toDate = args[++i];
          if (!isDateFormat(params.toDate)) {
            params.error = `🚨 Invalid date format for '--to' flag`;
            return params;
          }
          break;
        default:
          params.error = `🚨 Invalid flag provided`;
          break;
      }
    } catch (error) {
      if (error instanceof Error) {
        return { ...params, error: error.message };
      }
    }
  }

  if (!params.target) {
    params.error = `🚨 No target domain/URL provided`;
    return params;
  }

  return params;
};

export async function handleGauRequest(
  lastMessage: Message,
  corsHeaders: HeadersInit | undefined,
  enableGauFeature: boolean,
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
  if (!enableGauFeature) {
    return new Response('The GAU is disabled.', {
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

  const params = parseGauCommandLine(lastMessage.content);

  if (params.error) {
    return new Response(params.error, { status: 200, headers: corsHeaders });
  }

  let gauUrl = `${process.env.SECRET_GKE_PLUGINS_BASE_URL}/api/chat/plugins/gau?`;

  if (params.target) {
    gauUrl += `target=${encodeURIComponent(params.target)}`;
  }
  if (params.blacklist.length > 0) {
    gauUrl += `&blacklist=${params.blacklist.join(',')}`;
  }
  if (params.fc.length > 0) {
    gauUrl += `&fc=${params.fc.join(',')}`;
  }
  if (params.fromDate) {
    gauUrl += `&from=${params.fromDate}`;
  }
  if (params.ft.length > 0) {
    gauUrl += `&ft=${params.ft.join(',')}`;
  }
  if (params.fp) {
    gauUrl += `&fp=true`;
  }
  if (params.mc.length > 0) {
    gauUrl += `&mc=${params.mc.join(',')}`;
  }
  if (params.mt.length > 0) {
    gauUrl += `&mt=${params.mt.join(',')}`;
  }
  if (params.providers.length > 0) {
    gauUrl += `&providers=${params.providers.join(',')}`;
  }
  if (params.includeSubdomains) {
    gauUrl += `&subs=true`;
  }
  if (params.toDate) {
    gauUrl += `&to=${params.toDate}`;
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
      }, 20000);

      try {
        const gauResponse = await fetch(gauUrl, {
          method: 'GET',
          headers: {
            Authorization: `${process.env.SECRET_AUTH_PLUGINS}`,
            Host: 'plugins.hackergpt.co',
          },
        });

        let gauData = await gauResponse.text();

        if (gauData.length === 0) {
          const noDataMessage = `🔍 Didn't find any URLs for ${params.target}.`;
          clearInterval(intervalId);
          sendMessage(noDataMessage, true);
          controller.close();
          return new Response(noDataMessage, {
            status: 200,
            headers: corsHeaders,
          });
        }

        if (gauData.length > 50000) {
          gauData = gauData.slice(0, 50000);
        }

        clearInterval(intervalId);
        sendMessage('✅ Scan done! Now processing the results...', true);

        let urlsFormatted = processGauData(gauData);

        const date = new Date();
        const timezone = 'UTC-5';
        const formattedDateTime = date.toLocaleString('en-US', {
          timeZone: 'Etc/GMT+5',
          timeZoneName: 'short',
        });
        const responseString =
          '## [Gau](https://github.com/lc/gau) Scan Results\n' +
          '**Target**: "' +
          params.target +
          '"\n\n' +
          '**Scan Date and Time**:' +
          ` ${formattedDateTime} (${timezone}) \n\n` +
          '### Identified Urls:\n' +
          '```\n' +
          urlsFormatted.trim() +
          '\n' +
          '```\n';

        sendMessage(responseString, true);
        controller.close();
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

const processGauData = (data: string): string => {
  const lines = data.split('\n');

  const urls = lines
    .map((line) => {
      try {
        const json = JSON.parse(line);
        return json.url || '';
      } catch (error) {
        return '';
      }
    })
    .filter((url) => url !== '');

  return urls.join('\n');
};
