const MAX_AGENT_PROMPT_LENGTH = 2000;

export function normalizeAgentChatPrompt(
  value: string | null,
  maxLength = MAX_AGENT_PROMPT_LENGTH,
) {
  if (!value || maxLength <= 0) {
    return "";
  }

  return value
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function createInvestmentAgentChatHref(prompt: string) {
  const normalizedPrompt = normalizeAgentChatPrompt(prompt);
  const searchParams = new URLSearchParams({
    prompt: normalizedPrompt,
    source: "investment-agent",
  });

  return `/workspace/chats/new?${searchParams.toString()}`;
}
