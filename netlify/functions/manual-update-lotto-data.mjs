import updateHandler from "./update-lotto-data.mjs";

export default function handler(request) {
  const url = new URL(request.url);
  url.searchParams.set("force", "1");
  return updateHandler(new Request(url, request));
}
