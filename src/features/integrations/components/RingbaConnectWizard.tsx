import * as React from "react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getPublicAppOrigin, getRingbaPixelUrl } from "../helpers";
import { getRingbaWizardSteps } from "../wizard-content";
import { RingbaSetupWizardLayout } from "./RingbaSetupWizardLayout";
import { RingbaWizardStep } from "./RingbaWizardStep";

interface Props {
  integration: IntegrationCard;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function RingbaConnectWizard({ integration, isOpen, onClose, onComplete }: Props) {
  const steps = React.useMemo(() => getRingbaWizardSteps(), []);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [includePublisher, setIncludePublisher] = React.useState(true);
  const [includeBuyer, setIncludeBuyer] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setStepIndex(0);
      setIncludePublisher(true);
      setIncludeBuyer(false);
    }
  }, [isOpen]);

  const pixelUrl = React.useMemo(
    () =>
      getRingbaPixelUrl({
        origin: getPublicAppOrigin(),
        publicIngestKey: integration.ringba.publicIngestKey,
        includePublisher,
        includeBuyer,
      }),
    [includeBuyer, includePublisher, integration.ringba.publicIngestKey]
  );

  const stageIndex = stepIndex <= 7 ? 0 : stepIndex <= 12 ? 1 : 2;

  const handleNext = React.useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      onComplete();
      return;
    }

    setStepIndex((currentValue) => currentValue + 1);
  }, [onComplete, stepIndex, steps.length]);

  const handleBack = React.useCallback(() => {
    setStepIndex((currentValue) => Math.max(0, currentValue - 1));
  }, []);

  return (
    <RingbaSetupWizardLayout
      isOpen={isOpen}
      title="Connect Ringba"
      subtitle="Create a Ringba recording pixel, attach it to each campaign, then verify diagnostics after a completed call."
      currentStep={stepIndex + 1}
      totalSteps={steps.length}
      stages={[{ label: "Create Pixel" }, { label: "Add To Campaigns" }, { label: "Test" }]}
      currentStageIndex={stageIndex}
      nextLabel={stepIndex === steps.length - 1 ? "Test Connection" : "Next"}
      canGoBack={stepIndex > 0}
      onClose={onClose}
      onBack={handleBack}
      onNext={handleNext}
    >
      <RingbaWizardStep step={steps[stepIndex]!} codeValue={pixelUrl}>
        {steps[stepIndex]?.showOptionalFieldToggles ? (
          <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <button
              type="button"
              onClick={() => setIncludePublisher((currentValue) => !currentValue)}
              className={`rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                includePublisher
                  ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                  : "border-slate-700 bg-slate-950 text-slate-300"
              }`}
            >
              Publisher {includePublisher ? "On" : "Off"}
            </button>
            <button
              type="button"
              onClick={() => setIncludeBuyer((currentValue) => !currentValue)}
              className={`rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                includeBuyer
                  ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                  : "border-slate-700 bg-slate-950 text-slate-300"
              }`}
            >
              Buyer {includeBuyer ? "On" : "Off"}
            </button>
          </div>
        ) : null}
      </RingbaWizardStep>
    </RingbaSetupWizardLayout>
  );
}
