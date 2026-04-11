import * as React from "react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getWebhookEndpointUrl } from "../helpers";
import { getTrackDriveApiWizardSteps, getTrackDriveManualWizardSteps } from "../wizard-content";
import { IntegrationSetupWizardDialog } from "./IntegrationSetupWizardDialog";
import { IntegrationWizardStep } from "./IntegrationWizardStep";

type TrackDriveSetupPath = "api" | "manual";

interface Props {
  integration: IntegrationCard;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function TrackDriveConnectWizard({ integration, isOpen, onClose, onComplete }: Props) {
  const endpoint = React.useMemo(() => getWebhookEndpointUrl(), []);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [setupPath, setSetupPath] = React.useState<TrackDriveSetupPath>("api");
  const [subdomain, setSubdomain] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) {
      setStepIndex(0);
      setSetupPath("api");
      setSubdomain("");
    }
  }, [isOpen]);

  const providerSteps = React.useMemo(
    () => (setupPath === "api" ? getTrackDriveApiWizardSteps(subdomain) : getTrackDriveManualWizardSteps(endpoint)),
    [endpoint, setupPath, subdomain]
  );

  const totalSteps = providerSteps.length + 1;
  const currentStep = stepIndex + 1;
  const isChooserStep = stepIndex === 0;
  const contentStep = providerSteps[Math.max(0, stepIndex - 1)]!;
  const canGoNext = setupPath === "manual" || subdomain.trim().length > 0 || !isChooserStep;

  const handleNext = React.useCallback(() => {
    if (stepIndex >= totalSteps - 1) {
      onComplete();
      return;
    }

    setStepIndex((currentValue) => currentValue + 1);
  }, [onComplete, stepIndex, totalSteps]);

  const handleBack = React.useCallback(() => {
    setStepIndex((currentValue) => Math.max(0, currentValue - 1));
  }, []);

  const trackDriveUrl = subdomain.trim() ? `https://${subdomain.trim()}.trackdrive.com` : "https://trackdrive.com";

  return (
    <IntegrationSetupWizardDialog
      isOpen={isOpen}
      provider={integration.provider}
      title="Connect TrackDrive"
      currentStep={currentStep}
      totalSteps={totalSteps}
      nextLabel={stepIndex === totalSteps - 1 ? "Finish setup" : "Next"}
      canGoBack={stepIndex > 0}
      canGoNext={canGoNext}
      onClose={onClose}
      onBack={handleBack}
      onNext={handleNext}
      secondaryActionLabel={setupPath === "api" ? "Set up manually instead" : "Use API key setup instead"}
      onSecondaryAction={() => setSetupPath((currentValue) => (currentValue === "api" ? "manual" : "api"))}
    >
      {isChooserStep ? (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Choose how you want to connect TrackDrive</h3>
            <p className="mt-2 text-sm text-slate-300">
              DependableQA supports either a guided API-key path or a manual webhook trigger path.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSetupPath("api")}
              className={`rounded-2xl border p-4 text-left ${
                setupPath === "api"
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-slate-800 bg-slate-950/60 text-slate-300"
              }`}
            >
              <h4 className="font-semibold text-white">Connect with API key</h4>
              <p className="mt-2 text-sm text-slate-300">
                Follow the audited API & Access Tokens flow. This version keeps the wizard instructional.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setSetupPath("manual")}
              className={`rounded-2xl border p-4 text-left ${
                setupPath === "manual"
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-slate-800 bg-slate-950/60 text-slate-300"
              }`}
            >
              <h4 className="font-semibold text-white">Set up manually</h4>
              <p className="mt-2 text-sm text-slate-300">
                Use TrackDrive triggers to post events directly into the DependableQA webhook endpoint.
              </p>
            </button>
          </div>

          {setupPath === "api" ? (
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
              <label className="block text-sm font-medium text-slate-200" htmlFor="trackdrive-subdomain">
                TrackDrive subdomain
              </label>
              <input
                id="trackdrive-subdomain"
                type="text"
                value={subdomain}
                onChange={(event) => setSubdomain(event.target.value)}
                placeholder="your-company"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-500"
              />
              <p className="text-sm text-slate-400">
                Enter the TrackDrive subdomain you sign into so the next steps can point you to the right account.
              </p>
              <a
                href={trackDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
              >
                Open TrackDrive
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
              The manual path skips API keys and walks you through Company -&gt; Triggers instead.
            </div>
          )}
        </div>
      ) : (
        <IntegrationWizardStep {...contentStep} />
      )}
    </IntegrationSetupWizardDialog>
  );
}
