import axios from "axios";

interface GithubAuthResponse {
  auth?: {
    client_token?: string;
  };
}

export async function exchangeGithubToken(
  addr: string,
  githubToken: string
): Promise<string> {
  if (!addr) {
    throw new Error("Vault address (addr) is required");
  }

  if (!githubToken) {
    throw new Error("GitHub token is required");
  }

  try {
    const res = await axios.post<GithubAuthResponse>(
      `${addr}/v1/auth/github/login`,
      { token: githubToken },
      {
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const token = res.data?.auth?.client_token;

    if (!token) {
      throw new Error("Vault did not return a client_token");
    }

    return token;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;

      // Provide specific error messages based on status codes
      let errorMessage = `GitHub auth failed (${status ?? "no-status"})`;

      if (status === 401 || status === 403) {
        errorMessage += ": Invalid or expired GitHub token";
      } else if (status === 404) {
        errorMessage += ": Vault GitHub auth method not configured";
      } else if (status === 500 || status === 502 || status === 503) {
        errorMessage += ": Vault server error";
      }

      if (data) {
        try {
          errorMessage += `: ${JSON.stringify(data)}`;
        } catch {
          errorMessage += `: ${String(data)}`;
        }
      } else if (err.message) {
        errorMessage += `: ${err.message}`;
      }

      throw new Error(errorMessage, { cause: err });
    }

    if (err instanceof Error) {
      throw new Error(`GitHub auth failed: ${err.message}`, { cause: err });
    }

    throw new Error("GitHub auth failed: unknown error", { cause: err });
  }
}
