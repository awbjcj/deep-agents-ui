/**
 * Human-readable names for provider model IDs, for display only. API calls,
 * saved settings, and admin allowlists keep the exact IDs.
 */

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
};

const FAMILY_NAMES: Record<string, string> = {
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  llama: "Llama",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
};

const isNumber = (token: string) => /^\d+(\.\d+)*$/.test(token);

function titleCase(token: string): string {
  return token ? token[0].toUpperCase() + token.slice(1) : token;
}

/** `anthropic` → `Anthropic`; unknown providers are title-cased. */
export function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider.toLowerCase()] ?? titleCase(provider);
}

/**
 * `claude-haiku-4-5-20251001` → `Claude Haiku 4.5`,
 * `gpt-5.4-mini` → `GPT-5.4 mini`, `gemini-3.1-pro-preview` →
 * `Gemini 3.1 Pro (Preview)`. Dash-separated version digits are joined with
 * dots and trailing release dates are dropped.
 */
export function modelDisplayName(model: string): string {
  const tokens = model
    .trim()
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (tokens.length > 1 && /^\d{8}$/.test(tokens.at(-1) ?? "")) tokens.pop();
  if (!tokens.length) return model;

  // Collapse consecutive version numbers: ["4", "5"] → ["4.5"].
  const merged: string[] = [];
  for (const token of tokens) {
    const previous = merged.at(-1);
    if (previous && isNumber(previous) && isNumber(token)) {
      merged[merged.length - 1] = `${previous}.${token}`;
    } else merged.push(token);
  }

  const [family, ...rest] = merged;
  const words: string[] = [];
  if (family === "gpt") {
    const version = rest[0] && isNumber(rest[0]) ? rest.shift() : undefined;
    words.push(version ? `GPT-${version}` : "GPT");
  } else if (/^o\d+$/.test(family)) {
    return merged.join("-"); // OpenAI writes these as-is: o3, o4-mini.
  } else {
    words.push(FAMILY_NAMES[family] ?? titleCase(family));
  }
  let preview = false;
  for (const word of rest) {
    if (word === "preview") preview = true;
    else if (word === "mini" || word === "nano") words.push(word);
    else words.push(isNumber(word) ? word : titleCase(word));
  }
  return preview ? `${words.join(" ")} (Preview)` : words.join(" ");
}
