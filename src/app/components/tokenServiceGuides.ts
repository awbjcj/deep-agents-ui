import type { UserTokens } from "@/lib/auth";

/**
 * Window event used to (re)open the first-time token setup wizard from
 * anywhere in the app (e.g. the "Open guided setup" button in the Tokens
 * sidebar) without threading open-state props through the tree.
 */
export const OPEN_TOKEN_WIZARD_EVENT = "vsda:open-token-wizard";

export type TokenServiceKey =
  | "graph"
  | "jira"
  | "polarion_asux"
  | "polarion_prod1"
  | "confluence";

export interface TokenServiceGuide {
  /** Service key — matches the token input id prefix and notification focus key. */
  key: TokenServiceKey;
  label: string;
  /** Field name sent to PUT /user/tokens. */
  payloadField:
    | "graph_api_token"
    | "jira_api_token"
    | "polarion_asux_api_token"
    | "polarion_prod1_api_token"
    | "confluence_api_token";
  /** UserTokens preview field used to detect whether a token already exists. */
  previewField: keyof UserTokens;
  /** Short, human description of how long the token stays valid. */
  expiry: string;
  /** Builds the page where the user creates / copies the token. */
  url: (username: string) => string;
  /** Ordered setup steps shown in the guide and wizard. */
  steps: string[];
  /** Optional caveat shown below the steps. */
  note?: string;
}

export const TOKEN_SERVICE_GUIDES: TokenServiceGuide[] = [
  {
    key: "graph",
    label: "Graph API Token",
    payloadField: "graph_api_token",
    previewField: "graph_api_token_preview",
    expiry: "Expires about 6 hours after you sign in — refresh it when it lapses.",
    url: () => "https://developer.microsoft.com/en-us/graph/graph-explorer",
    steps: [
      "Open Microsoft Graph Explorer (link below) and sign in with your Aptiv account.",
      'Select the "Access token" tab near the top of the request panel.',
      "Copy the token shown there and paste it into the field above.",
    ],
  },
  {
    key: "jira",
    label: "JIRA API Token",
    payloadField: "jira_api_token",
    previewField: "jira_api_token_preview",
    expiry: "Valid for up to 90 days.",
    url: () =>
      "https://jiraprod.aptiv.com/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens",
    steps: [
      "Open your Jira personal access tokens page (link below).",
      'Click "Create token", give it a name, and choose an expiry (up to 90 days).',
      "Copy the generated token and paste it above — Jira only shows it once.",
    ],
  },
  {
    key: "polarion_asux",
    label: "Polarion (ASUX) Token",
    payloadField: "polarion_asux_api_token",
    previewField: "polarion_asux_api_token_preview",
    expiry: "Valid for up to 90 days.",
    url: () => "https://polarion.asux.aptiv.com/polarion/#/home",
    steps: [
      "Open the Polarion ASUX home page (link below) and sign in.",
      "Go to Settings → My Account → Personal Access Token.",
      "Create a new token and copy its value.",
      "Paste the token into the field above.",
    ],
  },
  {
    key: "polarion_prod1",
    label: "Polarion (Prod1) Token",
    payloadField: "polarion_prod1_api_token",
    previewField: "polarion_prod1_api_token_preview",
    expiry: "Valid for up to 90 days.",
    url: () => "https://polarionprod1.aptiv.com/polarion/#/home",
    steps: [
      "Open the Polarion Prod1 home page (link below) and sign in.",
      "Go to Settings → My Account → Personal Access Token.",
      "Create a new token and copy its value.",
      "Paste the token into the field above.",
    ],
  },
  {
    key: "confluence",
    label: "Confluence API Token",
    payloadField: "confluence_api_token",
    previewField: "confluence_api_token_preview",
    expiry: "Valid for the expiry you choose when creating it.",
    url: () =>
      "https://confluence.asux.aptiv.com/plugins/personalaccesstokens/usertokens.action",
    steps: [
      "Open your Confluence personal access tokens page (link below).",
      'Click "Create token", set a name and expiry, then copy it.',
      "Paste the token into the field above.",
    ],
  },
];

export function getTokenGuide(key: TokenServiceKey): TokenServiceGuide {
  const guide = TOKEN_SERVICE_GUIDES.find((g) => g.key === key);
  if (!guide) throw new Error(`Unknown token service: ${key}`);
  return guide;
}
