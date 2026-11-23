export const unitNames = {
  cubic_ft: "Cubic feet",
  piece: "Piece",
  running_ft: "Running feet",
  sq_ft: "Square feet",
};

export function payloadLines(lines) {
  return lines.map(({ itemType, pieces, lengthFt, widthIn, thicknessIn, ratePerUnit }) => ({
    itemType,
    pieces: Number(pieces),
    ...(lengthFt && { lengthFt: Number(lengthFt) }),
    ...(widthIn && { widthIn: Number(widthIn) }),
    ...(thicknessIn && { thicknessIn: Number(thicknessIn) }),
    ...(ratePerUnit !== "" && { ratePerUnit: Number(ratePerUnit) }),
  }));
}

export function linePreview(line, item) {
  const unit = item?.pricingUnit;
  const length = Number(line.lengthFt);
  const width = Number(line.widthIn) / 12;
  const thickness = Number(line.thicknessIn || item?.defaultThicknessIn) / 12;
  const factor = {
    piece: 1,
    running_ft: length,
    sq_ft: length * width,
    cubic_ft: length * width * thickness,
  }[unit];
  const quantity = Math.round(Number(line.pieces) * factor * 1000) / 1000;
  const rate = line.ratePerUnit === "" ? item?.pricePerUnit : Number(line.ratePerUnit);
  return { quantity, amount: Math.round((quantity * rate + Number.EPSILON) * 100) / 100 };
}

export const payloadCharges = (charges) =>
  charges.map(({ type, amount, taxable }) => ({ type, amount: Number(amount), taxable }));
