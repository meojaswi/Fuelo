function normalizeVehicle(value) {
  return value?.toUpperCase().replace(/\s/g, "") || undefined;
}

function hasUnusualFormat(number) {
  return Boolean(
    number && !/^(?:[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(number)
  );
}

module.exports = { normalizeVehicle, hasUnusualFormat };
