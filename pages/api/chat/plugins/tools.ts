export const isToolsCommand = (message: string) => {
  if (!message.startsWith('/')) return false;

  const commandPattern = /^\/tools$/;
  return commandPattern.test(message);
};

export const displayToolsHelpGuide = () => {
  return (
    'Tools available in HackerGPT:' +
    '\n\n' +
    '+ [Subfinder](https://github.com/projectdiscovery/subfinder): ' +
    'A powerful subdomain discovery tool. Use /subfinder -h for more details.' +
    '\n\n' +
    '+ [GAU (Get All URLs)](https://github.com/lc/gau): ' +
    'A tool for fetching known URLs from multiple sources. Use /gau -h for more details.' +
    '\n\n' +
    "To use these tools, type the tool's command followed by -h to see specific instructions and options for each tool."
  );
};
