const { roundMoney: round, priceForQuantity, MAX_MONEY } = require("../utils/money");
const { fail } = require("./atomic.service");

function readingsFor(input, expected) {
  const readings = new Map(input.map((row) => [String(row.nozzleId), row]));
  if (
    input.length !== expected.length ||
    readings.size !== expected.length ||
    expected.some((row) => !readings.has(String(row.nozzleId ?? row._id)))
  ) {
    fail(400, "Enter exactly one reading for each nozzle in this shift");
  }
  return readings;
}

function increment(map, key, value) {
  map.set(key, round((map.get(key) ?? 0) + value));
}

function calculateClose({ shift, input, transactions }) {
  const readings = readingsFor(input.nozzleReadings, shift.nozzleReadings);
  const prices = new Map(
    shift.pricesSnapshot.map(({ itemType, pricePerUnit }) => [itemType, pricePerUnit])
  );
  const byItem = new Map();
  const nozzleReadings = shift.nozzleReadings.map((row) => {
    const { closingMeter, testLitres } = readings.get(String(row.nozzleId));
    const pumped = round(closingMeter - row.openingMeter);
    if (pumped < 0) fail(400, "Closing meter cannot be lower than the opening meter");
    if (testLitres > pumped) fail(400, "Test litres cannot exceed the meter movement");
    const litresSold = round(pumped - testLitres);
    if (!byItem.has(row.itemType))
      byItem.set(row.itemType, { physical: 0, individual: 0, tanks: new Map() });
    const group = byItem.get(row.itemType);
    group.physical = round(group.physical + litresSold);
    increment(group.tanks, String(row.tankId), -litresSold);
    return { ...row, closingMeter, testLitres, litresSold };
  });

  for (const sale of transactions) {
    const group = byItem.get(sale.itemType);
    if (!group) continue;
    group.individual = round(group.individual + sale.quantity);
    const prior = sale.tankChanges ?? [];
    if (round(prior.reduce((sum, change) => sum - change.delta, 0)) !== sale.quantity) {
      fail(409, "An individually recorded sale has no matching tank allocation");
    }
    for (const change of prior) {
      increment(group.tanks, String(change.tankId), -change.delta);
    }
  }

  const stockEffects = [];
  for (const [itemType, { physical, individual, tanks }] of byItem) {
    if (individual > physical) fail(409, `Recorded sales exceed the meter litres for ${itemType}`);
    const changes = Array.from(tanks, ([tankId, delta]) => ({ tankId, delta })).filter(
      ({ delta }) => delta
    );
    if (changes.length)
      stockEffects.push({ itemType, delta: round(individual - physical), tankChanges: changes });
  }

  const expectedSalesTotal = round(
    nozzleReadings.reduce(
      (sum, row) => sum + priceForQuantity(prices.get(row.itemType), row.litresSold),
      0
    )
  );
  const creditSalesTotal = creditTotal(transactions);
  const declared = {
    declaredCash: input.declaredCash,
    declaredUpi: input.declaredUpi,
    declaredCard: input.declaredCard,
  };
  const variance = round(
    declared.declaredCash +
      declared.declaredUpi +
      declared.declaredCard +
      creditSalesTotal -
      expectedSalesTotal
  );
  if (
    [expectedSalesTotal, creditSalesTotal, variance].some(
      (number) => !Number.isFinite(number) || Math.abs(number) > MAX_MONEY
    )
  ) {
    fail(400, "The shift totals are outside the supported monetary range");
  }
  return {
    ...declared,
    nozzleReadings,
    creditSalesTotal,
    expectedSalesTotal,
    variance,
    stockEffects,
  };
}

function creditTotal(transactions) {
  return round(
    transactions
      .filter(({ paymentMode }) => paymentMode === "credit")
      .reduce((sum, { amount }) => sum + amount, 0)
  );
}

module.exports = { readingsFor, calculateClose, creditTotal };
