export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * An error whose message is already written for end users.
 * getFriendlyErrorMessage() returns its message unchanged.
 */
export class FriendlyError extends Error {
  constructor(message) {
    super(message);
    this.name = "FriendlyError";
  }
}

const GENERIC_FALLBACK = "Something went wrong. Please try again.";

const NETWORK_MESSAGE =
  "We couldn't reach the server. Please check your internet connection and try again.";

// Default message per context, used when nothing more specific applies.
const CONTEXT_FALLBACKS = {
  login: "We couldn't sign you in. Please try again.",
  register: "We couldn't create your account. Please try again.",
  logout: "We couldn't sign you out. Please try again.",
  history: "We couldn't load your conversations. Please refresh the page and try again.",
  conversation: "We couldn't open this conversation. Please try again.",
  delete: "We couldn't delete this conversation. Please try again.",
  voice: "We couldn't process your voice message. Please try again.",
  chat: "We couldn't send your message. Please try again.",
};

// Used for 400 / 422 responses when the server's own message can't be shown.
const VALIDATION_FALLBACKS = {
  login: "Please check your username and password and try again.",
  register: "Please check the details you entered and try again.",
};

// Browser errors thrown by getUserMedia / MediaRecorder (voice context only).
const MICROPHONE_ERRORS = {
  NotAllowedError:
    "Microphone access is blocked. Please allow it in your browser settings and try again.",
  PermissionDeniedError:
    "Microphone access is blocked. Please allow it in your browser settings and try again.",
  SecurityError:
    "Microphone access is blocked. Please allow it in your browser settings and try again.",
  NotFoundError: "We couldn't find a microphone. Please connect one and try again.",
  DevicesNotFoundError: "We couldn't find a microphone. Please connect one and try again.",
  OverconstrainedError: "We couldn't find a microphone. Please connect one and try again.",
  NotReadableError:
    "We couldn't access your microphone. Another app may be using it. Close it and try again.",
  TrackStartError:
    "We couldn't access your microphone. Another app may be using it. Close it and try again.",
  NotSupportedError: "Voice recording isn't supported in this browser.",
};

// Server messages that look technical are never shown to users.
const TECHNICAL_PATTERN =
  /failed to|exception|stack|trace|sql|undefined|\bnull\b|\bnan\b|typeerror|syntaxerror|econn|fetch|json|html|endpoint|backend|status|[{}<>]|\bat\s+\S+:\d+/i;

function isSafeServerMessage(message) {
  if (typeof message !== "string") return false;
  const text = message.trim();
  return text.length >= 3 && text.length <= 160 && !TECHNICAL_PATTERN.test(text);
}

/**
 * Turns any thrown error into a message that is safe and friendly to show.
 *
 * @param {unknown} error
 * @param {"login"|"register"|"logout"|"history"|"conversation"|"delete"|"voice"|"chat"} context
 * @returns {string}
 */
export function getFriendlyErrorMessage(error, context) {
  const fallback = CONTEXT_FALLBACKS[context] || GENERIC_FALLBACK;

  if (error instanceof FriendlyError) return error.message;

  // Microphone / recording problems
  if (context === "voice" && error && typeof error === "object") {
    const microphoneMessage = MICROPHONE_ERRORS[error.name];
    if (microphoneMessage) return microphoneMessage;
  }

  if (error instanceof ApiError) {
    const status = error.status;

    // fetch() never reached the server
    if (status === 0) return NETWORK_MESSAGE;

    if (status === 401) {
      if (context === "login") return "Incorrect username or password. Please try again.";
      if (context === "register") return fallback;
      return "Your session has expired. Please sign in again.";
    }

    if (status === 403) return "You don't have permission to do that.";

    if (status === 404) {
      if (context === "conversation" || context === "delete" || context === "chat") {
        return "We couldn't find this conversation. It may have been deleted.";
      }
      return fallback;
    }

    if (status === 408 || status === 504) {
      return "The request took too long. Please try again.";
    }

    if (status === 409) {
      if (context === "register") {
        return "That username is already taken. Please choose another.";
      }
      return fallback;
    }

    if (status === 413) {
      if (context === "voice") return "That recording is too long. Please try a shorter message.";
      if (context === "chat") return "Your message is too long. Please shorten it and try again.";
      return fallback;
    }

    if (status === 429) {
      return "You're going a little fast. Please wait a moment and try again.";
    }

    if (status === 400 || status === 422) {
      if ((context === "login" || context === "register") && isSafeServerMessage(error.message)) {
        return error.message.trim();
      }
      return VALIDATION_FALLBACKS[context] || fallback;
    }

    if (status >= 500) {
      return "Our server ran into a problem. Please try again in a moment.";
    }

    return fallback;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return NETWORK_MESSAGE;
  }

  return fallback;
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