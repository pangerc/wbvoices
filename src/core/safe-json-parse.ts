export function safeJSONParse<T>(src: any): T | void {
  try {
    return typeof src === "object" ? src : JSON.parse(src);
  } catch {
    return;
  }
}
