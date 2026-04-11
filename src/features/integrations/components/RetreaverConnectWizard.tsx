import * as React from "react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getWebhookEndpointUrl } from "../helpers";
import { getRetreaverWizardSteps } from "../wizard-content";
import { IntegrationSetupWizardDialog } from "./IntegrationSetupWizardDialog";
import { IntegrationWizardStep } from "./IntegrationWizardStep";

interface Props {
  integration: IntegrationCard;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function RetreaverConnectWizard({ integration, isOpen, onClose, onComplete }: Props) {
  const endpoint = React.useMemo(() => getWebhookEndpointUrl(), []);
  const steps = React.useMemo(() => getRetreaverWizardSteps(endpoint), [endpoint]);
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    if (!isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

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
    <IntegrationSetupWizardDialog
      isOpen={isOpen}
      provider={integration.provider}
      title="Connect Retreaver"
      currentStep={stepIndex + 1}
      totalSteps={steps.length}
      nextLabel={stepIndex === steps.length - 1 ? "Finish setup" : "Next"}
      canGoBack={stepIndex > 0}
      canGoNext={true}
      onClose={onClose}
      onBack={handleBack}
      onNext={handleNext}
    >
      <IntegrationWizardStep {...steps[stepIndex]!} />
    </IntegrationSetupWizardDialog>
  );
}
