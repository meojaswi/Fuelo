import client from "./client";

export async function getBilling() {
  return (await client.get("/billing/status")).data;
}

export async function cancelBilling() {
  return (await client.post("/billing/cancel")).data;
}

let checkoutScript;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  checkoutScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () =>
      window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout did not load."));
    script.onerror = () => {
      script.remove();
      reject(new Error("Could not load Razorpay Checkout."));
    };
    document.head.append(script);
  }).catch((err) => {
    checkoutScript = undefined;
    throw err;
  });
  return checkoutScript;
}

export async function choosePlan(planName, billingCycle) {
  const { data } = await client.post("/billing/subscriptions", { planName, billingCycle });
  if (data.scheduled) return data.message;
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const razorpay = new Razorpay({
      key: data.checkout.keyId,
      subscription_id: data.checkout.subscriptionId,
      name: "Fuelo",
      description: `${planName} · ${billingCycle}`,
      handler: () => resolve("Payment submitted. Your plan will update when Razorpay confirms it."),
      modal: { ondismiss: () => resolve("Checkout saved. Choose this plan again to resume.") },
    });
    razorpay.on("payment.failed", () => reject(new Error("Payment could not be completed.")));
    razorpay.open();
  });
}
