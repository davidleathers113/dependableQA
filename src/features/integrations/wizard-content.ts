export interface IntegrationWizardStepContent {
  title: string;
  description: string;
  bullets?: string[];
  note?: string;
}

export interface RingbaWizardStepContent {
  sectionLabel: string;
  title: string;
  description?: string;
  emphasis?: string;
  bullets?: string[];
  codeLabel?: string;
  showCopyButton?: boolean;
  showOptionalFieldToggles?: boolean;
  screenshotSrc?: string;
  screenshotAlt?: string;
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

export function getRingbaWizardSteps(): RingbaWizardStepContent[] {
  return [
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Open Ringba pixels",
      description: "In Ringba, go to Integrations -> Pixels.",
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Create a pixel",
      description: "Click + Create Pixel, then name it DependableQA or another recognizable label.",
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Set the fire condition",
      description: 'Set "Fire Pixel On" to Recording.',
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Review the optional Ringba fields",
      description: "Publisher is included by default. Buyer is optional and can be toggled on when you want buyer attribution in DependableQA.",
      showOptionalFieldToggles: true,
      note: "Toggling these options updates the full Ringba pixel URL before you copy it.",
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Copy the complete pixel URL",
      description: "Use this Ringba-ready pixel URL in the Ringba URL field.",
      codeLabel: "Complete Pixel URL",
      showCopyButton: true,
      emphasis: "This URL already includes the public ingest key plus the required Ringba query-string placeholders.",
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Paste the URL into Ringba",
      description: "Paste the complete pixel URL into the Ringba URL field.",
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Add the default tag filter",
      description: "Set the filter so DependableQA only receives calls after a connected duration threshold.",
      bullets: ["Call", "Call Length", "From Connect", "Greater Than", "30"],
      emphasis: "This matches the recommended 30-second minimum for qualified call review.",
    },
    {
      sectionLabel: "Step 1: Create the pixel",
      title: "Create the pixel",
      description: "Click Create to save the Ringba pixel.",
    },
    {
      sectionLabel: "Step 2: Add pixel to campaigns",
      title: "Remember the campaign requirement",
      description: "Ringba pixels must be added to each campaign individually.",
      note: "Creating the pixel does not automatically attach it to your campaigns.",
    },
    {
      sectionLabel: "Step 2: Add pixel to campaigns",
      title: "Open campaign tracking pixels",
      description: "Go to Campaigns -> [Your Campaign] -> Tracking Pixels.",
    },
    {
      sectionLabel: "Step 2: Add pixel to campaigns",
      title: "Add the existing DependableQA pixel",
      description: "Click Add Pixel -> Select Existing, then choose the DependableQA pixel you just created.",
    },
    {
      sectionLabel: "Step 2: Add pixel to campaigns",
      title: "Keep the 30-second minimum on the pixel",
      description: "You do not need to recreate the duration rule at the campaign level because it already lives on the pixel itself.",
    },
    {
      sectionLabel: "Step 2: Add pixel to campaigns",
      title: "Repeat for each campaign you want to track",
      description: "Attach the pixel to every Ringba campaign that should send calls into DependableQA.",
    },
    {
      sectionLabel: "Step 3: Test",
      title: "Wait for a real completed call, then test connection",
      description: "Ringba does not provide a test-fire button for this pixel flow.",
      bullets: [
        "Call the DID yourself, or wait for a real call.",
        "After the call completes, return to DependableQA.",
        "Use Test Connection to check whether diagnostics have updated.",
      ],
      emphasis: "If Ringba included a recording URL, DependableQA will queue transcription automatically after ingest.",
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
