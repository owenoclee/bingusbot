// requireEnv reads an environment variable or exits the process
// immediately if it is not set.
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    Deno.exit(1);
  }
  return value;
}

// optionalEnv reads an environment variable, returning undefined if
// it is empty or not set.
export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}
