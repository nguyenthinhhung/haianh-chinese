import { AwsClient } from "aws4fetch";

/** Where lesson pages and their pictures and sounds live. Only B2 implements it today. */
export interface FileStore {
  /** `range` is passed through as the HTTP Range header; the response keeps B2's status (200 or 206). */
  get(key: string, range?: string | null): Promise<Response>;
  exists(key: string): Promise<boolean>;
  put(key: string, body: ArrayBuffer | string, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface StoreEnv {
  B2_ENDPOINT: string;
  B2_REGION: string;
  B2_BUCKET: string;
  B2_KEY_ID: string;
  B2_APP_KEY: string;
}

export function createB2Store(env: StoreEnv): FileStore {
  const client = new AwsClient({ accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APP_KEY, service: "s3", region: env.B2_REGION });
  const url = (key: string) => `${env.B2_ENDPOINT}/${env.B2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return {
    get(key, range) {
      return client.fetch(url(key), range ? { headers: { Range: range } } : {});
    },
    async exists(key) {
      const res = await client.fetch(url(key), { method: "HEAD" });
      if (res.ok) return true;
      if (res.status === 404) return false;
      throw new Error(`B2 head ${key}: ${res.status}`);
    },
    async put(key, body, contentType) {
      const res = await client.fetch(url(key), { method: "PUT", body, headers: { "Content-Type": contentType } });
      if (!res.ok) throw new Error(`B2 put ${key}: ${res.status}`);
    },
    async delete(key) {
      const res = await client.fetch(url(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`B2 delete ${key}: ${res.status}`);
    },
  };
}
