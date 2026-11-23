const assert = require("node:assert/strict");
const { test } = require("node:test");
const { request, phaseWorkspace, inviteUser, sale } = require("./helpers/api");

const Workspace = require("../src/models/workspace.model");
const { istDateString, istDayBoundsUTC } = require("../src/utils/datetime");

function api(user) {
  return (path, method = "GET", body) =>
    request("/api" + path, { token: user.token, method, body });
}

test("tank and inventory stock agree after delivery, sale, void and adjustment", async () => {
  const owner = await phaseWorkspace("9000000062");
  const serve = api(owner);
  const tank = await serve("/tanks", "POST", {
    name: "Diesel Tank",
    itemType: "Diesel",
    capacityLitres: 100,
  });
  assert.equal(tank.status, 201, JSON.stringify(tank.data));
  const tankId = tank.data._id;
  async function stock(expected) {
    const tanks = (await serve("/tanks")).data.tanks;
    const inventory = (await serve("/inventory")).data.find((item) => item.itemType === "Diesel");
    assert.equal(inventory.currentStock, expected);
    assert.equal(
      tanks.reduce((total, item) => total + item.bookStock, 0),
      expected
    );
  }
  const body = { tankId, supplierName: "Oil", quantityLitres: 110, ratePerLitre: 90 };
  assert.equal((await serve("/deliveries", "POST", body)).status, 409);
  await stock(0);
  const delivery = await serve("/deliveries", "POST", { ...body, override: true });
  assert.equal(delivery.status, 201);
  assert.equal(delivery.data.totalAmount, 9900);
  await stock(110);
  const tx = await serve("/transactions", "POST", { ...sale, quantity: 20 });
  assert.equal(tx.status, 201);
  await stock(90);
  assert.equal(
    (await serve("/transactions/" + tx.data._id + "/void", "POST", { reason: "Test sale" })).status,
    200
  );
  await stock(110);
  assert.equal(
    (
      await serve("/deliveries/" + delivery.data._id + "/void", "POST", {
        reason: "Incorrect tanker",
      })
    ).status,
    200
  );
  await stock(0);
  assert.equal((await serve("/inventory/Diesel", "PATCH", { currentStock: 30 })).status, 200);
  await stock(30);
  assert.equal((await serve("/tanks/" + tankId, "DELETE", { reason: "Retired tank" })).status, 409);
  assert.equal((await serve("/deliveries?date=bad")).status, 400);
  assert.equal((await serve("/deliveries")).data.deliveries[0].status, "voided");

  const stranger = await phaseWorkspace("9000000063");
  const foreign = api(stranger);
  assert.deepEqual((await foreign("/tanks")).data.tanks, []);
  const ownTank = await foreign("/tanks", "POST", {
    workspaceId: owner.dealer.workspaceId,
    name: tank.data.name,
    itemType: "Diesel",
    capacityLitres: 500,
  });
  assert.equal(ownTank.status, 201);
  assert.equal(ownTank.data.workspaceId, stranger.dealer.workspaceId);
  assert.deepEqual((await serve("/tanks")).data.tanks.map((row) => row._id), [tankId]);
  assert.equal((await foreign("/tanks/" + tankId)).status, 404);
  assert.equal((await foreign("/tanks/" + tankId, "PATCH", { name: "Other" })).status, 404);
  assert.equal(
    (await foreign("/tanks/" + tankId, "DELETE", { reason: "Other tenant" })).status,
    404
  );
  assert.equal((await foreign("/deliveries", "POST", body)).status, 404);
  assert.equal(
    (
      await foreign("/deliveries/" + delivery.data._id + "/void", "POST", {
        reason: "Other tenant",
      })
    ).status,
    404
  );
  assert.deepEqual((await foreign("/deliveries")).data.deliveries, []);
  const attendant = api(await inviteUser(owner, "9000000064", "attendant"));
  assert.equal((await attendant("/tanks")).status, 403);
  assert.equal((await attendant("/deliveries")).status, 403);
  const { plans } = require("../src/config/plans");
  await Workspace.updateOne(
    { workspaceId: owner.dealer.workspaceId },
    { $set: { planLimits: plans[0].limits } }
  );
  assert.equal((await serve("/tanks")).data.code, "FEATURE_NOT_IN_PLAN");
  await Workspace.updateOne(
    { workspaceId: owner.dealer.workspaceId },
    { $set: { planLimits: plans[1].limits } }
  );
  assert.equal((await serve("/tanks")).status, 200);
});

async function setupShift(owner) {
  const serve = api(owner);
  const first = await serve("/tanks", "POST", {
    name: "Tank A",
    itemType: "Diesel",
    capacityLitres: 500,
  });
  const second = await serve("/tanks", "POST", {
    name: "Tank B",
    itemType: "Diesel",
    capacityLitres: 500,
  });
  for (const [tank, quantityLitres] of [
    [first, 100],
    [second, 200],
  ]) {
    assert.equal(
      (
        await serve("/deliveries", "POST", {
          tankId: tank.data._id,
          supplierName: "Supplier",
          quantityLitres,
          ratePerLitre: 70,
        })
      ).status,
      201
    );
  }
  assert.equal((await serve("/inventory/Diesel", "PATCH", { pricePerUnit: 100 })).status, 200);
  const created = await serve("/nozzles", "POST", {
    tankId: second.data._id,
    label: "Nozzle B",
    lastMeterReading: 1000,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  return { first: first.data, second: second.data, nozzle: created.data };
}

test("shift close records exactly the meter litres once and reopen reverses the residual", async () => {
  const owner = await phaseWorkspace("9000000065");
  const manager = await inviteUser(owner, "9000000066", "manager");
  const attendant = await inviteUser(owner, "9000000067", "attendant");
  const workspaceId = owner.dealer.workspaceId;
  assert.equal(
    (
      await api(owner)("/dealer", "PATCH", {
        shiftVarianceAlertRupees: 250,
        pumpVariancePercent: 0.5,
      })
    ).status,
    200
  );
  const { first, second, nozzle } = await setupShift(owner);
  const serve = api(owner);
  const operate = api(attendant);
  const opening = { nozzleReadings: [{ nozzleId: nozzle._id, openingMeter: 1000 }] };
  assert.equal(
    (
      await operate("/shifts/open", "POST", {
        nozzleReadings: [{ nozzleId: nozzle._id, openingMeter: 999 }],
      })
    ).status,
    400
  );
  const attempts = await Promise.all([
    operate("/shifts/open", "POST", opening),
    operate("/shifts/open", "POST", opening),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
  const shift = attempts.find((r) => r.status === 201).data;
  assert.equal((await operate("/shifts/" + shift._id)).status, 200);
  const tx = await operate("/transactions", "POST", {
    ...sale,
    quantity: 10,
    amount: 1000,
    vehicleNumber: "ka 01 ab 1234",
  });
  assert.equal(tx.status, 201);
  assert.equal(tx.data.shiftId, shift._id);
  assert.equal(tx.data.vehicleNumber, "KA01AB1234");
  const customer = (await serve("/customers/" + tx.data.customerId)).data;
  assert.equal(customer.vehicles[0].number, "KA01AB1234");
  assert.equal((await operate("/shifts/" + shift._id)).data.creditSalesTotal, 1000);
  const closing = {
    nozzleReadings: [{ nozzleId: nozzle._id, closingMeter: 1032, testLitres: 2 }],
    declaredCash: 1700,
    declaredUpi: 0,
    declaredCard: 0,
  };
  const other = await inviteUser(owner, "9000000068", "attendant");
  assert.equal((await api(other)("/shifts/" + shift._id)).status, 404);
  const closePath = "/shifts/" + shift._id + "/close";
  assert.equal((await api(other)(closePath, "POST", closing)).status, 403);
  assert.equal(
    (
      await operate(closePath, "POST", {
        ...closing,
        nozzleReadings: [{ nozzleId: nozzle._id, closingMeter: 999 }],
      })
    ).status,
    400
  );
  const closed = await operate(closePath, "POST", closing);
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  assert.equal(closed.data.nozzleReadings[0].litresSold, 30);
  assert.equal(closed.data.expectedSalesTotal, 3000);
  assert.equal(closed.data.variance, -300);
  assert.equal(closed.data.creditSalesTotal, 1000);
  async function stock(total, a, b) {
    assert.equal((await serve("/inventory")).data[0].currentStock, total);
    const { tanks } = (await serve("/tanks")).data;
    assert.equal(tanks.find((row) => row._id === first._id).bookStock, a);
    assert.equal(tanks.find((row) => row._id === second._id).bookStock, b);
  }
  await stock(270, 100, 170);
  assert.equal(
    (await operate(closePath, "POST", { ...closing, declaredCash: 0 })).data.variance,
    -300
  );
  await stock(270, 100, 170);
  const Job = require("../src/models/messageJob.model");
  const alerts = await Job.find({ workspaceId, body: /₹-300/ });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].contentSid, "HX" + "2".repeat(32));
  assert.deepEqual(alerts[0].contentVariables, { 1: "Phase Zero Station", 2: "-300.00" });
  const reopenPath = "/shifts/" + shift._id + "/reopen";
  assert.equal((await operate(reopenPath, "POST", { reason: "Wrong reading" })).status, 403);
  const stranger = await phaseWorkspace("9000000069");
  const { nozzle: strangerNozzle } = await setupShift(stranger);
  const foreign = api(stranger);
  assert.deepEqual((await foreign("/shifts")).data.shifts, []);
  assert.equal((await foreign("/shifts/" + shift._id)).status, 404);
  const attemptedOpen = await foreign("/shifts/open", "POST", {
    nozzleReadings: [{ nozzleId: nozzle._id, openingMeter: 1000 }],
  });
  assert.equal(attemptedOpen.status, 400);
  assert.match(attemptedOpen.data.error, /exactly one reading/);
  assert.equal((await foreign(closePath, "POST", closing)).status, 404);
  assert.equal((await foreign(reopenPath, "POST", { reason: "Wrong tenant" })).status, 404);
  assert.deepEqual(
    (await foreign("/nozzles")).data.nozzles.map((row) => row._id),
    [strangerNozzle._id]
  );
  assert.equal((await foreign("/nozzles/" + nozzle._id, "PATCH", { label: "Other" })).status, 404);
  assert.equal(
    (await foreign("/nozzles/" + nozzle._id, "DELETE", { reason: "Other tenant" })).status,
    404
  );
  assert.equal(
    (await foreign("/nozzles", "POST", { tankId: first._id, label: "Other" })).status,
    404
  );
  assert.equal((await api(manager)(reopenPath, "POST", { reason: "Wrong reading" })).status, 200);
  await stock(290, 90, 200);
  assert.equal((await serve("/nozzles")).data.nozzles[0].lastMeterReading, 1000);
});

test("daily pump report reconciles opening stock, meter sales, dips and CSV for the scoped workspace", async () => {
  const owner = await phaseWorkspace("9000000070");
  const serve = api(owner);
  const { first, second, nozzle } = await setupShift(owner);
  const workspaceId = owner.dealer.workspaceId;
  const date = istDateString();
  const StockMovement = require("../src/models/stockMovement.model");
  await StockMovement.updateOne(
    { workspaceId, reason: "purchase", "tankChanges.tankId": first._id },
    { $set: { createdAt: new Date(+istDayBoundsUTC(date).startUTC - 1000) } },
    { timestamps: false, overwriteImmutable: true }
  );
  const empty = await serve("/deliveries", "POST", {
    tankId: second._id,
    supplierName: "Void",
    quantityLitres: 5,
    ratePerLitre: 1,
  });
  assert.equal(
    (await serve("/deliveries/" + empty.data._id + "/void", "POST", { reason: "Duplicate entry" }))
      .status,
    200
  );
  await serve("/tanks/" + second._id, "PATCH", { name: 'Tank, "B"' });
  const open = await serve("/shifts/open", "POST", {
    nozzleReadings: [{ nozzleId: nozzle._id, openingMeter: 1000 }],
  });
  assert.equal(open.status, 201);
  assert.equal(
    (await serve("/transactions", "POST", { ...sale, quantity: 10, amount: 1000 })).status,
    201
  );
  const closed = await serve("/shifts/" + open.data._id + "/close", "POST", {
    nozzleReadings: [{ nozzleId: nozzle._id, closingMeter: 1030 }],
    declaredCash: 2000,
    declaredUpi: 0,
    declaredCard: 0,
  });
  assert.equal(closed.status, 200);
  const dipPath = "/tanks/" + second._id + "/dips";
  const attendant = api(await inviteUser(owner, "9000000071", "attendant"));
  assert.equal((await attendant(dipPath, "POST", { readingLitres: 170 })).status, 403);
  assert.equal((await attendant("/tanks/dip-targets")).status, 403);
  assert.equal((await serve("/dealer", "PATCH", { attendantsCanDip: true })).status, 200);
  assert.equal((await attendant("/tanks/dip-targets")).data.tanks.length, 2);
  assert.equal((await serve(dipPath, "POST", { readingLitres: 170 })).status, 201);
  assert.equal((await attendant(dipPath, "POST", { readingLitres: 169 })).data.varianceLitres, -1);
  assert.equal((await attendant(dipPath)).data.dips.length, 1);

  const path = "/reports/pump-daily?date=" + date;
  const report = await serve(path);
  assert.equal(report.status, 200, JSON.stringify(report.data));
  const { items, tanks, shifts } = report.data;
  assert.deepEqual(
    [
      items[0].openingBookStock,
      items[0].deliveriesLitres,
      items[0].meterSalesLitres,
      items[0].individualSalesLitres,
      items[0].meterAdditionalLitres,
      items[0].closingBookStock,
    ],
    [100, 200, 30, 10, 20, 270]
  );
  assert.equal(tanks.find((tank) => tank.tankId === second._id).flagged, true);
  assert.equal(shifts[0].variance, 0);
  assert.equal(shifts[0].litres, 30);
  await StockMovement.updateOne(
    { workspaceId, reason: "purchase", deliveryId: empty.data._id },
    { $set: { createdAt: new Date(+istDayBoundsUTC(date).startUTC - 500) } },
    { timestamps: false, overwriteImmutable: true }
  );
  const nextDayVoid = (await serve(path)).data.items[0];
  assert.equal(nextDayVoid.openingBookStock, 105);
  assert.equal(nextDayVoid.deliveriesLitres, 200);
  assert.equal(nextDayVoid.adjustmentLitres, -5);
  assert.equal(nextDayVoid.closingBookStock, 270);
  const csv = await serve(path + "&format=csv");
  assert.equal(csv.status, 200);
  assert.ok(csv.data.includes('"Tank, ""B"""'));
  assert.equal((await attendant(path)).status, 403);
  const foreign = api(await phaseWorkspace("9000000072"));
  assert.equal((await foreign(dipPath)).status, 404);
  assert.equal((await foreign(dipPath, "POST", { readingLitres: 170 })).status, 404);
  assert.deepEqual((await foreign("/tanks/dip-targets")).data.tanks, []);
  const foreignReport = (await foreign(path)).data;
  assert.deepEqual(foreignReport.tanks, []);
  assert.deepEqual(foreignReport.shifts, []);
});
