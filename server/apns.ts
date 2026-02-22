import type { APNsConfig } from "./types.ts";

const APNS_PROD = "https://api.push.apple.com";
const APNS_SANDBOX = "https://api.sandbox.push.apple.com";
const TOKEN_TTL_MS = 50 * 60 * 1000; // refresh JWT every 50 min (max is 60)

export class APNsClient {
  private config: APNsConfig;
  private host: string;
  private jwt: string | null = null;
  private jwtIssuedAt = 0;
  private deviceToken: string | null = null;
  private tokenPath: string;

  constructor(config: APNsConfig, dataDir: string) {
    this.config = config;
    this.host = config.sandbox ? APNS_SANDBOX : APNS_PROD;
    this.tokenPath = `${dataDir}/device_token.txt`;
    this.loadDeviceToken();
    console.log(`APNs using ${config.sandbox ? "sandbox" : "production"} environment`);
  }

  private loadDeviceToken() {
    try {
      this.deviceToken = Deno.readTextFileSync(this.tokenPath).trim();
      if (this.deviceToken) {
        console.log("loaded APNs device token from disk");
      }
    } catch {
      // no saved token
    }
  }

  setDeviceToken(token: string) {
    this.deviceToken = token;
    try {
      Deno.writeTextFileSync(this.tokenPath, token);
      console.log("saved APNs device token");
    } catch (err) {
      console.error("failed to save device token:", err);
    }
  }

  private async generateJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // Check if current token is still valid
    if (this.jwt && (Date.now() - this.jwtIssuedAt) < TOKEN_TTL_MS) {
      return this.jwt;
    }

    // Read the .p8 key
    const pemContents = await Deno.readTextFile(this.config.keyPath);
    const pemBody = pemContents
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");

    // Import the key
    const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );

    // Build JWT
    const header = { alg: "ES256", kid: this.config.keyId };
    const payload = { iss: this.config.teamId, iat: now };

    const encode = (obj: unknown) =>
      btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const unsignedToken = `${encode(header)}.${encode(payload)}`;
    const signatureBytes = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(unsignedToken),
    );

    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    this.jwt = `${unsignedToken}.${signature}`;
    this.jwtIssuedAt = Date.now();
    return this.jwt;
  }

  async sendPush(alert: string): Promise<boolean> {
    if (!this.deviceToken) {
      console.log("no device token, skipping push");
      return false;
    }

    try {
      const jwt = await this.generateJWT();
      const payload = JSON.stringify({
        aps: {
          alert: { title: "Bingus", body: alert.slice(0, 200) },
          sound: "default",
          "mutable-content": 1,
        },
      });

      // Use curl for HTTP/2 (Deno fetch doesn't support it natively)
      const cmd = new Deno.Command("curl", {
        args: [
          "--http2",
          "-s",
          "-w", "%{http_code}",
          "-X", "POST",
          `${this.host}/3/device/${this.deviceToken}`,
          "-H", `authorization: bearer ${jwt}`,
          "-H", `apns-topic: ${this.config.bundleId}`,
          "-H", "apns-push-type: alert",
          "-H", "apns-priority: 10",
          "-d", payload,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout, stderr } = await cmd.output();
      const output = new TextDecoder().decode(stdout);
      const errOutput = new TextDecoder().decode(stderr);

      // Last 3 chars are the HTTP status code
      const statusCode = output.slice(-3);
      if (statusCode === "200") {
        console.log("APNs push sent successfully");
        return true;
      } else {
        console.error(`APNs push failed (${statusCode}):`, output.slice(0, -3), errOutput);
        return false;
      }
    } catch (err) {
      console.error("APNs push error:", err);
      return false;
    }
  }
}
