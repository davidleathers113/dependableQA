export interface IntegrationWizardStepContent {
  title: string;
  description: string;
  bullets?: string[];
  note?: string;
}

export function getTrackDriveApiWizardSteps(subdomain: string): IntegrationWizardStepContent[] {
  const normalizedSubdomain = subdomain.trim();

  return [
    {
      title: "Open your API keys page",
      description: normalizedSubdomain
        ? `Go to ${normalizedSubdomain}.trackdrive.com, then open Integrations -> API & Access Tokens.`
        : "Go to your TrackDrive account, then open Integrations -> API & Access Tokens.",
    },
    {
      title: "Create a new API key",
      description: "Create a key that DependableQA can use during setup.",
      bullets: [
        'Description: "DependableQA"',
        "Access Type: Team member",
        "Grant Access: choose your own user",
      ],
    },
    {
      title: "Set permissions",
      description: "Configure the minimum permissions DependableQA needs to work correctly.",
      bullets: [
        "Offers: required so DependableQA can create webhooks",
        "Calls: optional if you want postback-style writebacks later",
      ],
    },
    {
      title: "Copy your keys",
      description: "After saving, TrackDrive shows both a public key and a private key.",
      note: "DependableQA does not store TrackDrive API keys in this version yet, so use this wizard as a guided checklist for the provider-side steps.",
    },
  ];
}

export function getTrackDriveManualWizardSteps(endpoint: string): IntegrationWizardStepContent[] {
  return [
    {
      title: "Open TrackDrive triggers",
      description: "In TrackDrive, go to Company -> Triggers.",
    },
    {
      title: "Create a new webhook trigger",
      description: "Click New Webhook and name it DependableQA.",
    },
    {
      title: "Choose the right trigger type",
      description: 'Set the trigger type to "Call - Ended and was connected to a buyer for this many seconds".',
    },
    {
      title: "Set duration threshold",
      description: "Use a minimum connected-call duration that matches your qualification workflow.",
      note: "ConvoQC recommends 30 seconds. DependableQA can support a similar threshold in the provider.",
    },
    {
      title: "Add the webhook URL",
      description: "Scroll to Webhook URLs and add a new URL entry for DependableQA.",
      bullets: [`Webhook URL: ${endpoint}`, 'Friendly Name: "DependableQA"'],
    },
  ];
}

export function getRingbaWizardSteps(endpoint: string): IntegrationWizardStepContent[] {
  return [
    {
      title: "Open Ringba pixels",
      description: "In Ringba, go to Integrations -> Pixels.",
    },
    {
      title: "Create a pixel",
      description: "Create a new pixel named DependableQA so it is easy to recognize later.",
    },
    {
      title: "Set the fire condition",
      description: 'Set "Fire Pixel On" to Recording or the equivalent completed-call event.',
    },
    {
      title: "Copy the complete webhook URL",
      description: "Ringba expects the full DependableQA webhook destination.",
      bullets: [`Complete Webhook URL: ${endpoint}`],
    },
    {
      title: "Paste the URL into Ringba",
      description: "Paste the complete webhook URL into the Ringba pixel destination and save.",
    },
  ];
}

export function getRetreaverWizardSteps(endpoint: string): IntegrationWizardStepContent[] {
  return [
    {
      title: "Open the campaign webhook settings",
      description: "In Retreaver, go to Campaigns -> [Your Campaign].",
    },
    {
      title: "Add a webhook",
      description: "Scroll to Webhooks and add a new webhook for DependableQA.",
    },
    {
      title: "Choose the buyer-connected trigger",
      description: 'Set the webhook trigger to a buyer-connected event such as "If call reached a buyer".',
    },
    {
      title: "Name the webhook clearly",
      description: 'Use a recognizable name such as "DependableQA".',
    },
    {
      title: "Paste the DependableQA webhook URL",
      description: "Use the complete webhook URL below when saving the Retreaver webhook.",
      bullets: [`Webhook URL: ${endpoint}`],
    },
  ];
}
