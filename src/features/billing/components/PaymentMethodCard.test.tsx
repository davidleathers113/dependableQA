import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentMethodCard } from "./PaymentMethodCard";

describe("PaymentMethodCard", () => {
  it("renders the missing payment method state", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodCard paymentMethod={null} isRefreshing={false} manageHref="/api/billing/portal" />
    );

    expect(html.includes("No payment method on file")).toBe(true);
    expect(html.includes("Add a card to enable auto-recharge")).toBe(true);
    expect(html.includes("Add payment method")).toBe(true);
  });

  it("renders real card details when the default payment method is ready", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodCard
        paymentMethod={{
          brand: "visa",
          last4: "4242",
          expMonth: 8,
          expYear: 2028,
          status: "ready",
          lastChargeAt: "2026-04-10T12:00:00.000Z",
        }}
        isRefreshing={false}
        manageHref="/api/billing/portal"
      />
    );

    expect(html.includes("Visa ending in 4242")).toBe(true);
    expect(html.includes("Expires 08/2028")).toBe(true);
    expect(html.includes("Ready for auto-recharge")).toBe(true);
  });

  it("renders the expired card state", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodCard
        paymentMethod={{
          brand: "visa",
          last4: "1111",
          expMonth: 1,
          expYear: 2024,
          status: "expired",
          lastChargeAt: null,
        }}
        isRefreshing={false}
        manageHref="/api/billing/portal"
      />
    );

    expect(html.includes("Card needs attention")).toBe(true);
    expect(html.includes("Expired")).toBe(true);
    expect(html.includes("Update card")).toBe(true);
  });
});
