export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path, { method = "GET", body, rawContentType } = {}) {
  const headers = { Accept: "application/json" };
  const options = {
    method,
    credentials: "include",
    headers,
  };

  if (body !== undefined) {
    if (rawContentType) {
      headers["Content-Type"] = rawContentType;
      options.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    throw new ApiError("Could not reach the server. Check that the backend is running.", 0);
  }

  let data = null;
  if (response.status !== 204) {
    const responseText = await response.text();
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        if (response.ok) {
          throw new ApiError("The server returned an invalid response.", response.status);
        }
      }
    }
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `Request failed with status ${response.status}.`;
    throw new ApiError(message, response.status);
  }

  return data;
}

export const authApi = {
  currentUser() {
    return request("/api/auth/me");
  },
  register({ name, username, password }) {
    return request("/api/auth/register", {
      method: "POST",
      body: { name, username, password },
    });
  },
  login({ username, password }) {
    return request("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },
  logout() {
    return request("/api/auth/logout", { method: "POST" });
  },
};

export const guestApi = {
  sendMessage(content, history) {
    return request("/api/guest/messages", {
      method: "POST",
      body: { content, history },
    });
  },
};

export const voiceApi = {
  transcribe(audioBlob) {
    return request("/api/voice/transcriptions", {
      method: "POST",
      body: audioBlob,
      rawContentType: audioBlob.type || "audio/webm",
    });
  },
  speech(text) {
    return request("/api/voice/speech", {
      method: "POST",
      body: { text },
    });
  },
};

export const conversationsApi = {
  list() {
    return request("/api/conversations");
  },
  create() {
    return request("/api/conversations", {
      method: "POST",
      body: {},
    });
  },
  get(conversationId) {
    return request(`/api/conversations/${encodeURIComponent(conversationId)}`);
  },
  delete(conversationId) {
    return request(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
    });
  },
  sendMessage(conversationId, content) {
    return request(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: { content },
      }
    );
  },
};
