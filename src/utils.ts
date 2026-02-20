export function isDev(): boolean {
  return process.env.ENV === "dev";
}
