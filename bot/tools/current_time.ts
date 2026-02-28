export async function current_time(): Promise<string> {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
