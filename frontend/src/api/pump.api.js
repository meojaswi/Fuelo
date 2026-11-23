import client from "./client";

export async function getPump(path, params) {
  return (await client.get(path, { params })).data;
}

export async function postPump(path, body) {
  return (await client.post(path, body)).data;
}

export async function exportPump(date) {
  const { data } = await client.get("/reports/pump-daily", {
    params: { date, format: "csv" },
    responseType: "text",
  });
  const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pump-daily-${date}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
