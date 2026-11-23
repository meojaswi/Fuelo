import client from "./client";

export const timberGet = (path, params) => client.get(path, { params }).then(({ data }) => data);
export const timberSend = (method, path, data) =>
  client.request({ method, url: path, data }).then((response) => response.data);

export function timberError(error, fallback) {
  const data = error.response?.data;
  return data?.issues?.[0]?.message || data?.error || fallback;
}

export async function downloadTimber(path, filename, params) {
  const { data } = await client.get(path, { params, responseType: "blob" });
  const href = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
