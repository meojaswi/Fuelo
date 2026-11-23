function csvLabel(value) {
  const label = String(value ?? "");
  // Protect spreadsheet users from formula execution in workspace-defined names.
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(label) ? "'" + label : label;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function csvCells(values) {
  return values.map((value) => (typeof value === "number" ? value : csvLabel(value))).join(",");
}

module.exports = { csvLabel, csvCells };
