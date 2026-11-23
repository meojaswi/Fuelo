const trialLimits = {
  maxUsers: 3,
  monthlyTransactionCap: 100,
  maxWorkspaces: 2,
  features: {
    pumpPack: true,
    timberPack: true,
    reports: true,
    creditLedger: true,
    csvExport: true,
    pdfReceipts: true,
  },
};

const plans = [
  {
    name: "Starter",
    monthly: 499,
    yearly: 4990,
    limits: {
      maxUsers: 1,
      monthlyTransactionCap: 300,
      maxWorkspaces: 1,
      features: {
        pumpPack: false,
        timberPack: false,
        reports: false,
        creditLedger: false,
        csvExport: false,
        pdfReceipts: false,
      },
    },
  },
  {
    name: "Growth",
    monthly: 999,
    yearly: 9990,
    limits: {
      maxUsers: 5,
      monthlyTransactionCap: 1500,
      maxWorkspaces: 2,
      features: {
        pumpPack: true,
        timberPack: true,
        reports: true,
        creditLedger: true,
        csvExport: true,
        pdfReceipts: true,
      },
    },
  },
  {
    name: "Business",
    monthly: 1999,
    yearly: 19990,
    limits: {
      maxUsers: 15,
      monthlyTransactionCap: null,
      maxWorkspaces: 5,
      features: {
        pumpPack: true,
        timberPack: true,
        reports: true,
        creditLedger: true,
        csvExport: true,
        pdfReceipts: true,
      },
    },
  },
];

module.exports = { plans, trialLimits };
